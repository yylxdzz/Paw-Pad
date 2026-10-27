import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  getOnboarded,
  isOnline,
  isSettled,
  onConnectionChange,
  probeBase,
  retryConnection,
  setApiBase,
  setOnboarded,
} from "../lib/connection";

/**
 * 模块 5（5.2）：首次连接引导。
 * 自动搜索失败且未引导过 → 弹出输入地址表单（一次性，localStorage.pawpad_onboarded 持久化）。
 * 输入后验证连通性（probeBase），通过则 setApiBase + setOnboarded 记住，之后不再弹；
 * 之后修改连接走角落面板「连接设置」（模块 6）。
 * 样式内联，保持本组件单文件自包含。
 */

/** 归一化用户输入：纯端口→localhost；补 http://；去尾部斜杠 */
function normalizeAddress(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) s = `http://localhost:${s}`;
  else if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/+$/, "");
}

export default function Onboarding() {
  const [online, setOnline] = useState<boolean | null>(isOnline());
  const [settled, setSettled] = useState(isSettled());
  const [address, setAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = onConnectionChange((on) => {
      setOnline(on);
      setSettled(true);
    });
    return off;
  }, []);

  // 已连上 → 不显示
  if (online) return null;
  // 首次搜索尚未结束 → 显示「搜索中」
  if (!settled) {
    return (
      <div style={panel}>
        <p style={hint}>正在自动搜索 QwenPaw…</p>
      </div>
    );
  }
  // 已引导过但当前离线 → 不打扰（走状态灯重试 / 模块 6 角落面板）
  if (getOnboarded()) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const base = normalizeAddress(address);
    if (!base) {
      setError("请输入 QwenPaw 地址");
      return;
    }
    setChecking(true);
    setError(null);
    const ok = await probeBase(base);
    setChecking(false);
    if (ok) {
      setApiBase(base);
      setOnboarded();
      await retryConnection(); // 立即刷新共享连接状态（状态灯变绿）
    } else {
      setError(`无法连接 ${base}`);
    }
  };

  return (
    <div style={panel}>
      <p style={title}>连接 QwenPaw</p>
      <p style={hint}>自动搜索未找到运行中的 QwenPaw。请输入地址（默认 http://localhost:8088）：</p>
      <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="http://localhost:8088"
          autoFocus
          style={input}
        />
        <button type="submit" disabled={checking} style={button}>
          {checking ? "连接中…" : "连接"}
        </button>
      </form>
      {error && <p style={errStyle}>{error}</p>}
    </div>
  );
}

const panel: CSSProperties = {
  margin: "8px 12px",
  padding: "12px 14px",
  borderRadius: 10,
  background: "var(--bg-card)",
  border: "1px solid var(--border-mid)",
};
const title: CSSProperties = {
  margin: "0 0 6px",
  font: '600 13px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--text-primary)",
};
const hint: CSSProperties = {
  margin: 0,
  font: '12px/1.5 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--text-faint)",
};
const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-hover)",
  background: "var(--bg-input)",
  color: "var(--text-meta)",
  font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
  outline: "none",
};
const button: CSSProperties = {
  flex: "none",
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid var(--border-hover)",
  background: "var(--fill-mid)",
  color: "var(--text-meta)",
  font: '12px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  cursor: "pointer",
};
const errStyle: CSSProperties = {
  margin: "8px 0 0",
  font: '12px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--danger-strong)",
};
