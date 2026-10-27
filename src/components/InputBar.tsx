/**
 * T14 输入框 + T11 slash 命令提示 + T12 停止按钮 + 模块 2（@ 文件补全 / chip），四位一体。
 *
 * D12 C5 发送纪律：显式发送（点按钮或 Enter）；无消息队列、无断线重放、无后台重试。
 * isStreaming 期间输入框不禁用（用户可继续输入），但发送按钮是停止（■）；
 * 此时按 Enter 不排队，只提示"正在生成中"——后端同 session 并发会 409，且 sse.ts 是单流假设。
 *
 * 模块 2：
 * - 2.1 打 @ 触发文件搜索补全（useFileSearch → Rust search_files：glob+fuzzy，200ms debounce，限 20 条）
 * - 2.2 附件以 chip 展示在输入框上方（FileChip；统一 @/拖拽/粘贴/浮球投放四来源，App 持有状态）
 *
 * 模块 7：
 * - 7.1 草稿持久化：输入变化即写 localStorage（key `pawpad-draft`），App 重开时恢复，发送成功后清空
 * - 7.2 命令去重：发送瞬间进入 sending 锁定态（按钮 disabled 防连点），
 *   onTurnComplete / onError（殊途同归地体现为流态结束或 turnDoneTick 递增）后恢复，超时安全阀兜底
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { filterCommands, isSlashCommand, type SlashCommand } from "../lib/commands";
import { useFileSearch, type FileEntry } from "../hooks/useFileSearch";
import FileChip, { type AttachedFile } from "./FileChip";
import ScreenshotButton from "./ScreenshotButton";

interface InputBarProps {
  /** 发送（App 接线：appendUserMessage + streamChat；slash 命令同路透传） */
  onSend: (text: string) => void;
  /** 停止（App 接线：cancelActiveStream + /stop 透传） */
  onStop: () => void;
  /** 生成中：发送按钮变停止按钮，Enter 不发送 */
  isStreaming: boolean;
  /** 模块 2（2.2）：当前附件（@/拖拽/粘贴/浮球投放统一来源，App 持有并落 chip） */
  attachments?: AttachedFile[];
  /** 模块 2：新增附件（App 内部走 2.4 统一 upload 链路） */
  onAddFile?: (input: { name: string; path?: string; file?: File }) => void;
  /** 模块 2（2.2）：移除附件（× 删除） */
  onRemoveFile?: (id: string) => void;
  /** 模块 7.2：App 接线——onTurnComplete / onError 到达时递增此值，InputBar 收到即解除发送锁定 */
  turnDoneTick?: number;
}

/** T14：多行自适应最大高度 */
const MAX_HEIGHT = 120;
/** T14：生成中再发送的提示（C5 无队列） */
const BUSY_HINT = "正在生成中，停止后可发送";
const HINT_TIMEOUT_MS = 2000;
/** 模块 7.1：草稿持久化 localStorage key */
const DRAFT_KEY = "pawpad-draft";
/** 模块 7.2：发送锁定的超时安全阀（ms）——App 两条回调路径都未触发时兜底解锁，防按钮永久禁用 */
const SENDING_TIMEOUT_MS = 15000;

/** 模块 2（2.1）：行尾 @token 识别（`@` 后跟无空格 token；行首或空格后触发）。 */
const AT_TOKEN_RE = /(?:^|\s)@([^\s@]*)$/;

export default function InputBar({
  onSend,
  onStop,
  isStreaming,
  attachments,
  onAddFile,
  onRemoveFile,
  turnDoneTick,
}: InputBarProps) {
  const [text, setText] = useState("");
  /** 模块 7.2：发送锁定态（命令去重）——发送瞬间 true，turn 结束 / 出错 / 超时后 false */
  const [sending, setSending] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* ---------- 模块 7.1：草稿持久化 ---------- */

  // 7.1：发送成功后清空草稿存储
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 隐私模式 / 配额异常：忽略，不影响主流程 */
    }
  }, []);

  // 7.1：App 重开时从 localStorage 恢复草稿到输入框
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setText(saved);
    } catch {
      /* 忽略 */
    }
  }, []);

  const commands = filterCommands(text);

  /* ---------- 模块 2（2.1）：@ 文件搜索补全 ---------- */

  const { results: fileResults, searching, search, clear } = useFileSearch();
  // 行尾是否在输入 @token；null = 未触发
  const atMatch = AT_TOKEN_RE.exec(text);
  const atQuery = atMatch ? atMatch[1] : null;
  const [atDismissed, setAtDismissed] = useState(false);

  // 输入变化 → 触发/关闭搜索（hook 内部 200ms debounce）
  useEffect(() => {
    if (atQuery !== null) search(atQuery);
    else clear();
  }, [atQuery, search, clear]);

  // @token 变化时重置 Esc 关闭态
  useEffect(() => {
    setAtDismissed(false);
  }, [atQuery]);

  // @token 变化时重置文件浮层选中项（防旧下标越界）
  useEffect(() => {
    setActiveIndex(0);
  }, [atQuery]);

  const filePaletteOpen =
    atQuery !== null && !atDismissed && (atQuery === "" || searching || fileResults.length > 0);

  // 选中文件 → 交 App 走统一 upload → 落 chip；并从输入框移除 @token
  const selectFile = useCallback(
    (entry: FileEntry) => {
      onAddFile?.({ name: entry.name, path: entry.path });
      const idx = text.lastIndexOf("@");
      if (idx >= 0) setText(text.slice(0, idx).replace(/\s+$/, ""));
      setAtDismissed(true);
      taRef.current?.focus();
    },
    [onAddFile, text],
  );

  // 多行自适应：随内容增高，封顶 MAX_HEIGHT 后内部滚动
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  // 瞬时提示 2s 自消
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), HINT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [hint]);

  // T11：选中命令 → 填入输入框（替换正在输入的 slash token，用户可继续输参数）
  const insertCommand = useCallback((cmd: SlashCommand) => {
    setText(`${cmd.name} `);
    setPaletteOpen(false);
    setActiveIndex(0);
    taRef.current?.focus();
  }, []);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (sending) return; // 7.2：命令去重——发送锁定中，连点 / 连按 Enter 只发一次
    if (isStreaming) {
      setHint(BUSY_HINT); // C5：不排队，只提示
      return;
    }
    onSend(trimmed);
    setText("");
    setPaletteOpen(false);
    setActiveIndex(0);
    clearDraft(); // 7.1：发送成功后清空草稿存储
    setSending(true); // 7.2：发送瞬间锁定按钮，防连点
  }, [text, isStreaming, sending, onSend, clearDraft]);

  /* ---------- 模块 7.2：发送锁定解除（去重的恢复侧） ---------- */

  // 流态 生成中→结束（onTurnComplete / onError 殊途同归）→ disabled=false 恢复
  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) setSending(false);
    prevStreaming.current = isStreaming;
  }, [isStreaming]);

  // App 显式回调 tick（onTurnComplete / onError 到达时递增 turnDoneTick）→ disabled=false 恢复
  useEffect(() => {
    if (turnDoneTick !== undefined) setSending(false);
  }, [turnDoneTick]);

  // 安全阀：两条回调路径均未触发时，超时自动解锁，避免按钮永久禁用
  useEffect(() => {
    if (!sending) return;
    const t = setTimeout(() => setSending(false), SENDING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [sending]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 模块 2（2.1）：文件补全浮层打开时优先接管按键
    if (filePaletteOpen) {
      if (e.key === "ArrowDown" && fileResults.length > 0) {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % fileResults.length);
        return;
      }
      if (e.key === "ArrowUp" && fileResults.length > 0) {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + fileResults.length) % fileResults.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && fileResults.length > 0) {
        e.preventDefault();
        selectFile(fileResults[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAtDismissed(true);
        return;
      }
    }
    // 浮层打开时：方向键导航 / Enter·Tab 选中 / Esc 关闭
    if (paletteOpen && commands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % commands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + commands.length) % commands.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertCommand(commands[activeIndex]);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        insertCommand(commands[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPaletteOpen(false);
        return;
      }
    }
    // Enter 发送 / Shift+Enter 换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);
    // 模块 7.1：每次输入变化持久化草稿（空串则清 key）
    try {
      if (v) localStorage.setItem(DRAFT_KEY, v);
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 忽略 */
    }
    // T11：首字符 / → 弹命令提示
    setPaletteOpen(isSlashCommand(v));
    setActiveIndex(0);
  };

  return (
    <div className="input-bar">
      {paletteOpen && commands.length > 0 && (
        <div className="cmd-palette" role="listbox" aria-label="命令提示">
          {commands.map((c, i) => (
            <button
              key={c.name}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={`cmd-palette__item${i === activeIndex ? " cmd-palette__item--active" : ""}`}
              // mousedown + preventDefault：先于 textarea blur 生效，避免点击落空
              onMouseDown={(e) => {
                e.preventDefault();
                insertCommand(c);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="cmd-palette__name">{c.name}</span>
              <span className="cmd-palette__desc">{c.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* 模块 2（2.1）：@ 文件搜索补全浮层（glob+fuzzy，限 20 条） */}
      {filePaletteOpen && (
        <div className="cmd-palette" role="listbox" aria-label="文件提示">
          {fileResults.length === 0 ? (
            <div className="cmd-palette__item" role="option" aria-selected={false}>
              <span className="cmd-palette__desc">
                {searching ? "搜索中…" : atQuery === "" ? "输入文件名搜索文件" : "未找到匹配文件"}
              </span>
            </div>
          ) : (
            fileResults.map((f, i) => (
              <button
                key={f.path}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className={`cmd-palette__item${i === activeIndex ? " cmd-palette__item--active" : ""}`}
                // mousedown + preventDefault：先于 textarea blur 生效，避免点击落空
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectFile(f);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="cmd-palette__name">{f.name}</span>
                <span className="cmd-palette__desc">{f.is_dir ? "目录 · " : ""}{f.path}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* 模块 2（2.2）：附件 chip 行（输入框上方；统一 @/拖拽/粘贴/浮球投放四来源） */}
      {attachments && attachments.length > 0 && (
        <div className="input-bar__chips">
          {attachments.map((f) => (
            <FileChip key={f.id} file={f} onRemove={onRemoveFile ?? (() => {})} />
          ))}
        </div>
      )}

      <div className="input-bar__row">
        <button
          type="button"
          className="input-bar__attach"
          title="引用文件（插入 @ 触发搜索）"
          aria-label="附件"
          onClick={() => {
            // 统一入口：插 @ 走同一条搜索补全（不另开原生选择器）
            setText((t) => (t === "" || t.endsWith(" ") ? `${t}@` : `${t} @`));
            taRef.current?.focus();
          }}
        >
          📎
        </button>
        {/* 模块 3：截图入口（📷 + ⌘⇧X），紧邻 📎；截图后走 onAddFile 统一
            upload 链路落 chip（复用 FileChip），并聚焦输入框等用户补话 */}
        <ScreenshotButton
          onAddFile={onAddFile}
          onFocusInput={() => taRef.current?.focus()}
        />
        <textarea
          ref={taRef}
          className="input-bar__textarea"
          value={text}
          rows={1}
          placeholder="输入消息，/ 命令，Enter 发送"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
        {isStreaming ? (
          <button
            type="button"
            className="input-bar__stop"
            onClick={onStop}
            aria-label="停止生成"
            title="停止生成"
          >
            ■
          </button>
        ) : (
          <button
            type="button"
            className="input-bar__send"
            onClick={send}
            disabled={text.trim().length === 0 || sending}
            aria-label="发送"
            title="发送"
          >
            ↑
          </button>
        )}
      </div>

      {hint && (
        <div className="input-bar__hint">
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
