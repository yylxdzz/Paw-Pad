import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TopBar from "./components/TopBar";
import MessageList, { type MessageListHandle } from "./components/MessageList";
import InputBar from "./components/InputBar";
import OfflineBanner from "./components/OfflineBanner";
import Orb from "./components/Orb";
import { type AttachedFile } from "./components/FileChip";
import { useFileDrop } from "./hooks/useFileDrop";
import { toContentPart, uploadFile } from "./lib/upload";
import {
  getCurrentAgentId,
  getCurrentSessionId,
  newSession,
  onSessionChange,
  resolveSession,
  switchAgent,
} from "./lib/session";
import { cancelActiveStream, streamChat } from "./lib/sse";
import { bootstrapConnection } from "./lib/connection";
// 模块 6（6.3）：UI 事件记日志（只记事件类型，无对话内容）
import { logError, logInfo, logWarn } from "./lib/logger";
import { refreshApprovals, startApprovalPoll } from "./lib/approval-poll";
import type { ToolCallInfo, ToolResultInfo } from "./types";
import Onboarding from "./components/Onboarding";
import "./styles/app.css";

/** 模块 1：浮球窗口（Rust 侧创建，label: "floating_orb"）只挂 Orb UI。 */
const IS_ORB_WINDOW = getCurrentWindow().label === "floating_orb";

/**
 * 模块 2（2.2/2.4）：统一附件状态。
 * 所有文件来源（@ 搜索 / 主窗拖拽 / ⌘V 粘贴 / 浮球投放）都经 addFile →
 * lib/upload.ts 的统一 upload 链路（POST /api/console/upload）落同一个数组，
 * 发送时把 url 转成 file_url / image_url content part 填进 chat input 数组。
 */
type Attachment = AttachedFile;

/** 附件 id 序号（chip key / 删除用）。 */
let attachSeq = 0;

/** 模块 1（1.3）：主窗口 → 浮球状态转发（生成中/完成/错误等）。 */
async function emitOrbStatus(status: string): Promise<void> {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit("orb-status", status);
    void logInfo("orb", `status emitted: ${status}`);
  } catch (e) {
    // 浮球窗口不存在时静默——但留痕（诊断 2026-10-27：光晕缺失链路排查）
    void logWarn("orb", `status emit failed: ${status}: ${String(e)}`);
  }
}

function App() {
  if (IS_ORB_WINDOW) {
    return <Orb />;
  }

  // T14 发送接线：streamChat 回调直通 MessageListHandle 五方法
  const listRef = useRef<MessageListHandle>(null);

  // T7 接线：session 状态驱动 MessageList 拉历史
  const [session, setSession] = useState<{
    agentId: string | null;
    sessionId: string | null;
  }>({ agentId: null, sessionId: null });

  // T12：生成态（发送按钮 ↔ 停止按钮）
  const [isStreaming, setIsStreaming] = useState(false);

  /* ---------- 模块 1（1.4/1.8）：浮球 ↔ 主窗口三段接力 ---------- */

  const [relaying, setRelaying] = useState<"idle" | "summon" | "recall">("idle");
  const recallingRef = useRef(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  /**
   * 模块 2（2.4）：统一入口——新增附件即走统一 upload 链路。
   * 拖拽/粘贴传 file（File 对象）；@ 搜索/浮球投放传 path（本地绝对路径）。
   */
  const addFile = useCallback((input: { name: string; path?: string; file?: File }) => {
    const id = `file-${++attachSeq}`;
    setAttachments((prev) => [...prev, { id, name: input.name, uploading: true }]);
    void uploadFile(input)
      .then((r) =>
        setAttachments((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, name: r.fileName, url: r.url, uploading: false, isImage: r.isImage }
              : f,
          ),
        ),
      )
      .catch(() =>
        setAttachments((prev) =>
          prev.map((f) => (f.id === id ? { ...f, uploading: false, failed: true } : f)),
        ),
      );
  }, []);

  const removeFile = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // 模块 2（2.3）：主窗口拖拽 + ⌘V 粘贴（dragDropEnabled:false + preventDefault）
  const { isDragOver } = useFileDrop({
    onFiles: (files) => files.forEach((file) => addFile({ name: file.name, file })),
  });

  /**
   * 呼出：窗口位置与出现侧（右半屏→主窗左上 / 左半屏→主窗右上、origin 朝浮球）
   * 已由 Rust 侧 show_window 计算落位；此处只播放 280ms scale .35→1 放大动画。
   */
  const summonMain = useCallback(async (originX: "left" | "right") => {
    const win = getCurrentWindow();
    setRelaying("summon");
    document.documentElement.style.setProperty("--summon-origin-x", originX);
    try {
      await win.show();
      await win.setFocus();
    } catch {
      // ignore
    }
    window.setTimeout(() => setRelaying("idle"), 280);
  }, []);

  /** 缩回：主窗 280ms 收缩 → 通知浮球 spring 弹回 → Rust 侧隐藏主窗口。 */
  const recallMain = useCallback(async () => {
    if (recallingRef.current) return;
    recallingRef.current = true;
    setRelaying("recall");
    // D38（2026-10-29）：缩回动画起点（0ms）即刻摘红绿灯。280ms CSS 动画
    // 会把 app-shell 缩没，但原生按钮不受 CSS 管——动画尾段（~130-280ms）
    // 只剩红绿灯单独残留约 140ms（30fps 录屏逐帧实证）。在 0ms 摘钮，
    // 整个缩回期间按钮已不可见。恢复按钮在 summon_main 的 show 前闭包（D37）。
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("hide_traffic_lights");
    } catch (e) {
      void logError("window", `hide_traffic_lights failed: ${String(e)}`);
    }
    const { emit } = await import("@tauri-apps/api/event");
    window.setTimeout(async () => {
      try {
        await emit("orb-recall", null);
      } catch {
        // ignore
      }
      // 缩回终点：hide 主窗口改走 Rust 侧 hide_main_window。
      // 原先前端 `getCurrentWindow().hide()` 是 window 插件的
      // `core:window:allow-hide` 命令，而 main 窗口的 capabilities/
      // default.json 只授 core:default → core:window:default（该默认集
      // 不含 allow-hide/allow-show/allow-set-focus，见 src-tauri/
      // gen/schemas/acl-manifests.json），invoke 被 ACL 拒绝，reject 又被
      // `.catch(() => {})` 吞掉 → 主窗口不隐藏且 dev 日志无报错。
      // Rust 侧 window.hide() 不经 ACL，故收归 hide_main_window。
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("hide_main_window");
      } catch (e) {
        // 不再静默：失败要留痕（Rust 侧同时记 is_visible 校验日志）
        void logError("window", `hide_main_window failed: ${String(e)}`);
      }
      setRelaying("idle");
      recallingRef.current = false;
    }, 280);
  }, []);

  // 浮球 click / 菜单「新建」/ 快捷键 → window-summon：主窗放大出现
  useEffect(() => {
    const offs: Array<() => void> = [];
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const o1 = await listen<{ originX?: "left" | "right" }>("window-summon", (ev) => {
        void summonMain(ev.payload.originX ?? "right");
      });
      offs.push(o1);
    })();
    return () => offs.forEach((f) => f());
  }, [summonMain]);

  // 红绿灯 ❌ → 缩回浮球（Rust 侧 CloseRequested prevent_close + emit
  // "window-recall"）：与 Esc/浮球单击同一 recallMain 路径，hide 不销毁，
  // 保证再单击浮球/⌘⇧Space 能正常呼出。
  useEffect(() => {
    const offs: Array<() => void> = [];
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const o1 = await listen("window-recall", () => {
        void recallMain();
      });
      offs.push(o1);
    })();
    return () => offs.forEach((f) => f());
  }, [recallMain]);

  // ESC 缩回；浮球菜单「隐藏」→ orb-command 亦走缩回
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void recallMain();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recallMain]);

  // 浮球菜单命令（新建/隐藏）
  useEffect(() => {
    const offs: Array<() => void> = [];
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const o1 = await listen<string>("orb-command", (ev) => {
        if (ev.payload === "new-session") {
          newSession();
          listRef.current?.appendSystemMessage("新对话");
        }
      });
      const o2 = await listen<{ paths?: string[] }>("orb-dropped", async (ev) => {
        const paths = ev.payload?.paths ?? [];
        if (paths.length === 0) return;
        // 模块 2（2.4）：浮球投放也走统一 upload 链路（读元信息 → addFile）
        const { invoke } = await import("@tauri-apps/api/core");
        const files = (await invoke("read_dropped_files", { paths })) as Array<{
          path: string;
          name: string;
          size: number;
        }>;
        for (const f of files) {
          addFile({ name: f.name, path: f.path });
        }
      });
      offs.push(o1, o2);
    })();
    return () => offs.forEach((f) => f());
  }, [addFile]);

  // D33②/D17：失焦不收起——切到别的 App 主窗口保持可见（vibrancy 失焦压暗提供视觉反馈）。
  // 主动权给用户：仅通过浮球单击 / ⌘⇧Space / Escape 主动收起（顶栏无 x 按钮，设计决议）。

  // 1.3：生成态转发给浮球（蓝 + 呼吸）；停止/完成态不在此处强制回常态——
  // 完成/错误由 streamChat 回调发 done/error（浮球 hover 或 2.5s 自动清除），
  // 审批不自动消失（浮球侧 300s 兜底）。
  useEffect(() => {
    if (isStreaming) void emitOrbStatus("generating");
  }, [isStreaming]);

  // 启动：resolveSession + 订阅 onSessionChange（null 清界面/有值拉历史）
  useEffect(() => {
    const off = onSessionChange((sessionId) => {
      setSession({ agentId: getCurrentAgentId(), sessionId });
    });
    void resolveSession().then((sessionId) => {
      setSession({ agentId: getCurrentAgentId(), sessionId });
    });
    return off;
  }, []);

  // 模块 5：启动连接体系（端口发现 + 5s 自动重连）；仅主窗口（浮球窗口已提前 return <Orb/>）
  useEffect(() => {
    const stop = bootstrapConnection();
    return stop;
  }, []);

  // 模块 8：审批感知轮询（5s 定时 + 对话流结束补拉）+ 双入口 prune + 浮球审批态联动。
  // 新 pending → 插卡片 + 浮球审批态（黄 #fcd34d）；resolved（对端 Console 决策 /
  // 本地决策 / 300s 超时）→ 卡片收起 + 全部 resolved 后清浮球态。
  useEffect(() => {
    return startApprovalPoll({
      onNewApproval: (approval) => {
        listRef.current?.insertApproval(approval);
        void emitOrbStatus("approval");
      },
      onResolved: (approval, pendingCount) => {
        listRef.current?.pruneApproval(approval.id);
        if (pendingCount === 0) void emitOrbStatus("approval-resolved");
      },
    });
  }, []);

  // 顶栏切 agent：走 T5 switchAgent（置空 session + 接新 agent 最近活跃）
  const handleAgentChange = useCallback((agentId: string) => {
    void switchAgent(agentId);
  }, []);

  // B1：新建 Session（顶栏「＋」与 ⌘N 共用）。
  // newSession() 内部已写持久化 + emit——onSessionChange 订阅推到 MessageList，
  // 由 loadHistory（新 session 无 chat → 空列表）完成清空，此处不显式 clear（不双重清空）；
  // 「新对话」系统提示由 MessageList 的加载保留逻辑（ts >= 加载开始时刻）不被吞掉。
  const handleNewSession = useCallback(() => {
    newSession();
    listRef.current?.appendSystemMessage("新对话");
  }, []);

  // B1：⌘N（macOS）/ Ctrl+N（其他平台）新建 Session
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewSession();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewSession]);

  // T14：发送（slash 命令同路透传，App 不解析含义——D14）。
  // 模块 2（2.4）：附件经统一 upload 后，url 转 content part（image_url / file_url）随本条消息发出。
  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      void logInfo("ui", "send message"); // 模块 6（6.3）：只记事件，不记内容
      listRef.current?.appendUserMessage(trimmed);
      setIsStreaming(true);
      // 2.4：只带上传成功（有 url 且未失败）的附件；类型按 file_url / image_url 分流
      const parts = attachments
        .filter((a) => a.url && !a.failed)
        .map((a) => toContentPart(a.url as string, a.isImage ?? false));
      const handlers = {
        onToken: (t: string) => listRef.current?.appendToken(t),
        onToolCall: (c: ToolCallInfo) => listRef.current?.upsertToolCall(c),
        onToolResult: (r: ToolResultInfo) => listRef.current?.completeToolResult(r),
        onTurnComplete: () => {
          listRef.current?.finishTurn();
          setIsStreaming(false);
          void emitOrbStatus("done");
          // 模块 8：对话流结束补拉一次审批（不等 5s 定时轮询）
          void refreshApprovals();
        },
        onError: (e: Error) => {
          listRef.current?.finishTurn();
          listRef.current?.appendSystemMessage(`连接中断：${e.message}`);
          setIsStreaming(false);
          void emitOrbStatus("error");
          void refreshApprovals();
          void logError("sse", `stream error: ${e.message}`); // 模块 6（6.3）
        },
      };
      const agentId = getCurrentAgentId() ?? undefined;
      const sessionId = getCurrentSessionId();
      // 无附件时保持 4 参调用（InputBar.interaction.test.tsx 钉住的调用契约）
      if (parts.length > 0) {
        void streamChat(trimmed, agentId, sessionId, handlers, parts);
      } else {
        void streamChat(trimmed, agentId, sessionId, handlers);
      }
      setAttachments([]);
    },
    [isStreaming, attachments],
  );

  // T12：停止——① cancelActiveStream 本地断流（Rust 侧释放 body）
  // ② /stop 整条透传后端（走 streamChat：完整消费掉 ack 流，避免 sendChatMessage 的 Response 无人读导致 body 悬挂）
  // ③ UI 回输入态
  const handleStop = useCallback(() => {
    cancelActiveStream();
    void logInfo("ui", "stop generation"); // 模块 6（6.3）
    listRef.current?.finishTurn();
    setIsStreaming(false);
    void streamChat("/stop", getCurrentAgentId() ?? undefined, getCurrentSessionId(), {
      onTurnComplete: () => {},
    });
    // 模块 8：停止也是对话流结束——补拉一次审批
    void refreshApprovals();
  }, []);

  return (
    <div className={`app-shell${relaying !== "idle" ? ` app-relay-${relaying}` : ""}`}>
      <div className="app-drag" data-tauri-drag-region />
      <TopBar
        onAgentChange={handleAgentChange}
        onNewSession={handleNewSession}
      />
      <OfflineBanner />
      <Onboarding />
      <MessageList ref={listRef} agentId={session.agentId} sessionId={session.sessionId} />
      {/* 模块 2（2.3）：拖入覆盖层「投放给 agent」 */}
      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay__card">
            <span aria-hidden>📥</span>
            <span>投放给 agent</span>
          </div>
        </div>
      )}
      <InputBar
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        attachments={attachments}
        onAddFile={addFile}
        onRemoveFile={removeFile}
      />
    </div>
  );
}

export default App;
