import { useEffect, useState } from "react";
import { isOnline, isSettled, onConnectionChange, retryConnection } from "../lib/connection";

/**
 * 模块 5（5.3）：连接状态灯。
 * 绿 = SSE 正常在线；灰 = 断开离线（搜索中亦为中性灰）。
 * 灰点 hover 显示「无法连接 QwenPaw」+ 重试按钮；不弹系统弹窗（统一在对话流内提示）。
 * 样式内联，保持本组件单文件自包含。
 */
export default function StatusLight() {
  const [online, setOnline] = useState<boolean | null>(isOnline());
  const [settled, setSettled] = useState(isSettled());
  const [hover, setHover] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const off = onConnectionChange((on) => {
      setOnline(on);
      setSettled(true);
    });
    return off;
  }, []);

  const connecting = online === null || !settled;
  const offline = settled && online === false;

  // 绿(在线) / 灰(离线) / 中性灰(搜索中)
  const dotColor = connecting ? "var(--text-secondary)" : online ? "var(--online)" : "var(--text-tertiary)";

  const onRetry = async () => {
    setRetrying(true);
    try {
      await retryConnection();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        cursor: offline ? "help" : "default",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="status"
      aria-label={connecting ? "连接中" : online ? "QwenPaw 在线" : "QwenPaw 离线"}
      title={connecting ? "正在连接 QwenPaw…" : online ? "已连接 QwenPaw" : "无法连接 QwenPaw"}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: online ? "0 0 6px var(--online-glow)" : "none",
          transition: "background 0.2s",
        }}
      />
      {offline && hover && (
        <span
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 8,
            background: "var(--bg-popover)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-meta)",
            fontSize: 12,
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-float)",
          }}
        >
          <span>无法连接 QwenPaw</span>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              border: "1px solid var(--border-hover)",
              background: "var(--fill)",
              color: "var(--text-meta)",
              fontSize: 12,
              cursor: retrying ? "default" : "pointer",
            }}
          >
            {retrying ? "重试中…" : "重试"}
          </button>
        </span>
      )}
    </span>
  );
}
