/**
 * 模块 3（3.1/3.2）：截图入口（输入区 📷 按钮 + 全局快捷键 ⌘⇧X）。
 *
 * 流程：
 * - 点 📷 / 按 ⌘⇧X（Rust 侧 Cmd+Shift+X → emit "screenshot-requested"）
 *   → take_screenshot（Rust：screencapture -i -c 系统原生选区 UI → 剪贴板
 *   PNG → 临时文件 → 返回路径）
 * - 成功后 → onAddFile({ name, path })（复用模块 2 的 App 统一 upload 链路
 *   POST /api/console/upload）→ chip（复用 FileChip）
 * - 完成后 onFocusInput() 聚焦输入框等用户补话——**不自动发送**（3.2）
 * - screencapture 运行期间（capturing）按钮变黄呼吸（3.2）
 *
 * 与 📎 按钮并排（紧邻）置于输入区左侧；自包含样式，不扩散到 app.css
 * （除复用 .input-bar__attach 基础态外）。
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

interface ScreenshotButtonProps {
  /** 模块 2（2.4）：新增附件（App 内部走统一 upload 链路 → FileChip） */
  onAddFile?: (input: { name: string; path?: string; file?: File }) => void;
  /** 截图完成后聚焦输入框（3.2：等用户补话，不自动发送） */
  onFocusInput?: () => void;
}

export default function ScreenshotButton({ onAddFile, onFocusInput }: ScreenshotButtonProps) {
  const [capturing, setCapturing] = useState(false);

  const startCapture = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // null = 用户 Esc 取消（screencapture 退出码非 0，Rust 侧不读剪贴板）
      const result = (await invoke("take_screenshot")) as { path: string; name: string } | null;
      if (result?.path) {
        // 复用模块 2.4 统一 upload 链路 → App attachments → FileChip
        onAddFile?.({ name: result.name, path: result.path });
        // 3.2：聚焦输入框等用户补话；不自动发送
        onFocusInput?.();
      }
    } catch (e) {
      console.error("截图失败：", e);
    } finally {
      setCapturing(false);
    }
  }, [capturing, onAddFile, onFocusInput]);

  // ⌘⇧X 全局快捷键（Rust 侧注册 → emit "screenshot-requested"）：
  // 与点 📷 走同一 startCapture 路径。ref 持最新回调，避免每次
  // capturing 态变化都重订阅事件。
  const startRef = useRef(startCapture);
  startRef.current = startCapture;
  useEffect(() => {
    let off: (() => void) | null = null;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      off = await listen("screenshot-requested", () => {
        void startRef.current();
      });
    })();
    return () => {
      off?.();
    };
  }, []);

  // 3.2：截图中——黄底呼吸（screencapture 原生选区 UI 运行期间）；
  // 常态复用 .input-bar__attach（与 📎 同基础态，hover 由 app.css 提供）。
  const btnStyle: CSSProperties = capturing
    ? {
        flex: "none",
        border: "none",
        background: "var(--warn)",
        cursor: "default",
        fontSize: 14,
        padding: "6px 4px",
        borderRadius: 6,
        animation: "screenshot-breathe 1.2s ease-in-out infinite",
      }
    : {
        flex: "none",
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: 14,
        padding: "6px 4px",
        borderRadius: 6,
        opacity: 0.5,
      };

  return (
    <>
      {/* 呼吸动画：capturing 期间黄底明暗脉冲 + 光圈扩散 */}
      <style>{`
        @keyframes screenshot-breathe {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--warn-glow); }
          50% { opacity: 0.78; box-shadow: 0 0 0 5px transparent; }
        }
      `}</style>
      <button
        type="button"
        className="input-bar__attach input-bar__screenshot"
        style={btnStyle}
        title="截图（⌘⇧X）"
        aria-label="截图"
        disabled={capturing}
        onClick={() => void startCapture()}
      >
        📷
      </button>
    </>
  );
}
