import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import MessageList, { type MessageListHandle } from "./components/MessageList";
import InputBar from "./components/InputBar";
import OfflineBanner from "./components/OfflineBanner";
import {
  getCurrentAgentId,
  getCurrentSessionId,
  newSession,
  onSessionChange,
  resolveSession,
  switchAgent,
} from "./lib/session";
import { cancelActiveStream, streamChat } from "./lib/sse";
import "./styles/app.css";

function App() {
  // T14 发送接线：streamChat 回调直通 MessageListHandle 五方法
  const listRef = useRef<MessageListHandle>(null);

  // T7 接线：session 状态驱动 MessageList 拉历史
  const [session, setSession] = useState<{
    agentId: string | null;
    sessionId: string | null;
  }>({ agentId: null, sessionId: null });

  // T12：生成态（发送按钮 ↔ 停止按钮）
  const [isStreaming, setIsStreaming] = useState(false);

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

  // T14：发送（slash 命令同路透传，App 不解析含义——D14）
  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      listRef.current?.appendUserMessage(trimmed);
      setIsStreaming(true);
      void streamChat(trimmed, getCurrentAgentId() ?? undefined, getCurrentSessionId(), {
        onToken: (t) => listRef.current?.appendToken(t),
        onToolCall: (c) => listRef.current?.upsertToolCall(c),
        onToolResult: (r) => listRef.current?.completeToolResult(r),
        onTurnComplete: () => {
          listRef.current?.finishTurn();
          setIsStreaming(false);
        },
        onError: (e) => {
          listRef.current?.finishTurn();
          listRef.current?.appendSystemMessage(`连接中断：${e.message}`);
          setIsStreaming(false);
        },
      });
    },
    [isStreaming],
  );

  // T12：停止——① cancelActiveStream 本地断流（Rust 侧释放 body）
  // ② /stop 整条透传后端（走 streamChat：完整消费掉 ack 流，避免 sendChatMessage 的 Response 无人读导致 body 悬挂）
  // ③ UI 回输入态
  const handleStop = useCallback(() => {
    cancelActiveStream();
    listRef.current?.finishTurn();
    setIsStreaming(false);
    void streamChat("/stop", getCurrentAgentId() ?? undefined, getCurrentSessionId(), {
      onTurnComplete: () => {},
    });
  }, []);

  return (
    <div className="app-shell">
      <div className="app-drag" data-tauri-drag-region />
      <TopBar onAgentChange={handleAgentChange} onNewSession={handleNewSession} />
      <OfflineBanner />
      <MessageList ref={listRef} agentId={session.agentId} sessionId={session.sessionId} />
      <InputBar onSend={handleSend} onStop={handleStop} isStreaming={isStreaming} />
    </div>
  );
}

export default App;
