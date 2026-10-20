/**
 * T14 输入框 + T11 slash 命令提示 + T12 停止按钮，三位一体。
 *
 * D12 C5 发送纪律：显式发送（点按钮或 Enter）；无消息队列、无断线重放、无后台重试。
 * isStreaming 期间输入框不禁用（用户可继续输入），但发送按钮是停止（■）；
 * 此时按 Enter 不排队，只提示"正在生成中"——后端同 session 并发会 409，且 sse.ts 是单流假设。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { filterCommands, isSlashCommand, type SlashCommand } from "../lib/commands";

interface InputBarProps {
  /** 发送（App 接线：appendUserMessage + streamChat；slash 命令同路透传） */
  onSend: (text: string) => void;
  /** 停止（App 接线：cancelActiveStream + /stop 透传） */
  onStop: () => void;
  /** 生成中：发送按钮变停止按钮，Enter 不发送 */
  isStreaming: boolean;
}

/** T14：多行自适应最大高度 */
const MAX_HEIGHT = 120;
/** T14：@ 识别提示（P1 不实现搜索，仅提示） */
const AT_HINT = "文件引用 P1 待实现";
/** T14：附件按钮占位提示 */
const ATTACH_HINT = "附件上传 P1 待实现";
/** T14：生成中再发送的提示（C5 无队列） */
const BUSY_HINT = "正在生成中，停止后可发送";
const HINT_TIMEOUT_MS = 2000;

export default function InputBar({ onSend, onStop, isStreaming }: InputBarProps) {
  const [text, setText] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const commands = filterCommands(text);
  const showAtHint = /(^|\s)@/.test(text);

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
    if (isStreaming) {
      setHint(BUSY_HINT); // C5：不排队，只提示
      return;
    }
    onSend(trimmed);
    setText("");
    setPaletteOpen(false);
    setActiveIndex(0);
  }, [text, isStreaming, onSend]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

      <div className="input-bar__row">
        <button
          type="button"
          className="input-bar__attach"
          title="附件（P1 占位）"
          aria-label="附件"
          onClick={() => setHint(ATTACH_HINT)}
        >
          📎
        </button>
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
            disabled={text.trim().length === 0}
            aria-label="发送"
            title="发送"
          >
            ↑
          </button>
        )}
      </div>

      {(showAtHint || hint) && (
        <div className="input-bar__hint">
          {showAtHint && <span>{AT_HINT}</span>}
          {showAtHint && hint && <span className="input-bar__hint-sep">·</span>}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
