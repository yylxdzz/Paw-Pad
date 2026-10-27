import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getApiBase, probeBase, retryConnection, setApiBase } from "../lib/connection";
import { logError, logInfo } from "../lib/logger";
import ShortcutSettings from "./ShortcutSettings";

/**
 * 模块 6（6.1/6.4）：角落面板 + 日志导出入口。
 *
 * 顶栏最右「⋯」→ 轻量面板，5 项：
 *   1. 连接设置（复用模块 5 的 lib/connection：setApiBase + probeBase + retryConnection）
 *   2. 导出日志（6.4：invoke("export_logs") → Rust 打包最近 7 天 → 桌面）
 *   3. 快捷键设置（6.2：ShortcutSettings 三行录制/冲突/恢复默认）
 *   4. 检查更新（占位：Tauri updater 具体接入归工程侧；命中新版时置
 *      updateAvailable → 「⋯」显示小红点角标）
 *   5. 关于（占位：名称 / 版本）
 *
 * 样式内联，保持本组件单文件自包含（对齐模块 5 StatusLight/Onboarding 风格）。
 */

type View = "menu" | "connection" | "shortcuts" | "update" | "about";

/** 关于页展示的版本（与 package.json 对齐） */
const APP_VERSION = "1.0.0";

/**
 * 5 项菜单的线性 SVG 图标（16px，stroke=currentColor）。
 *
 * A3 修复（运行验证）：原来是 emoji / 实心字符（🔗📦⌨🔄ℹ），风格与浮球弧形
 * 菜单的线性图标语言不统一。此处统一为线条 SVG（同 Orb.tsx MENU_ITEMS 的
 * viewBox 24 / strokeWidth 2 / round 端帽），颜色由 itemIcon 的 currentColor
 * 继承（默认 55% 白，hover 由按钮态提亮）。
 */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** 线性图标路径（与浮球弧形菜单同一图标语言） */
const ICONS: Record<string, ReactNode> = {
  /** 连接设置：双链环 */
  link: (
    <svg {...LINE_ICON}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  /** 导出日志：下载箭头入托盘 */
  download: (
    <svg {...LINE_ICON}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  /** 快捷键设置：键盘（外框 + 键位点 + 空格条） */
  keyboard: (
    <svg {...LINE_ICON}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  ),
  /** 检查更新：双箭头循环 */
  refresh: (
    <svg {...LINE_ICON}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  /** 关于：圆 + i */
  info: (
    <svg {...LINE_ICON}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
};

/** 归一化用户输入：纯端口→localhost；补 http://；去尾部斜杠（同 Onboarding） */
function normalizeAddress(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) s = `http://localhost:${s}`;
  else if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/+$/, "");
}

export default function CornerPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  /** 有新版本 → 「⋯」显示小红点角标（6.1） */
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* ---------- 连接设置（复用模块 5 connection 体系） ---------- */
  const [addr, setAddr] = useState<string>(() => getApiBase());
  const [connMsg, setConnMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const onSaveConnection = useCallback(async () => {
    const base = normalizeAddress(addr);
    if (!base) {
      setConnMsg("请输入 QwenPaw 地址");
      return;
    }
    setChecking(true);
    setConnMsg(null);
    const ok = await probeBase(base);
    setChecking(false);
    if (ok) {
      setApiBase(base);
      await retryConnection(); // 立即刷新共享连接状态（状态灯变绿）
      setConnMsg(`已连接 ${base}`);
      void logInfo("connection", `base set via corner panel: ${base}`);
    } else {
      setConnMsg(`无法连接 ${base}`);
    }
  }, [addr]);

  /* ---------- 导出日志（6.4） ---------- */
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const onExportLogs = useCallback(async () => {
    setExporting(true);
    setExportMsg("打包中…");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("export_logs");
      setExportMsg(`已导出到桌面：${path}`);
      void logInfo("corner-panel", "export logs ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportMsg(`导出失败：${msg}`);
      void logError("corner-panel", `export logs failed: ${msg}`);
    } finally {
      setExporting(false);
    }
  }, []);

  /* ---------- 检查更新（占位） ---------- */
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const onCheckUpdate = useCallback(async () => {
    setUpdateMsg("检查中…");
    // 占位实现：Tauri updater 接入归工程侧；当前版本即最新。
    // 真接入后命中新版 → setUpdateAvailable(true) → 「⋯」红点角标亮起。
    await new Promise((r) => setTimeout(r, 300));
    setUpdateAvailable(false);
    setUpdateMsg(`已是最新版本 v${APP_VERSION}`);
    void logInfo("corner-panel", "check update (placeholder): latest");
  }, []);

  // 点击外部关闭整个面板
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const choose = (v: View) => {
    setView(v);
    if (v === "connection") setConnMsg(null);
    if (v === "update") setUpdateMsg(null);
  };

  const menuItems: Array<{ label: string; icon: ReactNode; onClick: () => void }> = [
    { label: "连接设置", icon: ICONS.link, onClick: () => choose("connection") },
    { label: "导出日志", icon: ICONS.download, onClick: () => void onExportLogs() },
    { label: "快捷键设置", icon: ICONS.keyboard, onClick: () => choose("shortcuts") },
    { label: "检查更新", icon: ICONS.refresh, onClick: () => choose("update") },
    { label: "关于", icon: ICONS.info, onClick: () => choose("about") },
  ];

  return (
    // flex:none：顶栏空间不足时本入口不被压缩（否则「⋯」会被挤出圆角边缘裁切）
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", flex: "none" }}>
      {/* 「⋯」入口：有新版本时小红点角标（6.1） */}
      <button
        type="button"
        className="corner-panel__more"
        style={moreBtn}
        aria-label="更多设置"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setView("menu");
        }}
      >
        ⋯
        {updateAvailable && <span style={badge} title="有新版本" />}
      </button>

      {open && (
        <div style={panel}>
          {view === "menu" && (
            <>
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  style={itemBtn}
                  onClick={item.onClick}
                  disabled={item.label === "导出日志" && exporting}
                >
                  <span style={itemIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
              {exportMsg && (
                <p style={msgStyle(exportMsg.startsWith("导出失败") ? "var(--danger-strong)" : "var(--text-secondary)")}>
                  {exportMsg}
                </p>
              )}
            </>
          )}

          {view === "connection" && (
            <div style={subView}>
              <div style={subHeader}>
                <button type="button" style={backBtn} onClick={() => choose("menu")}>
                  ←
                </button>
                <span style={subTitle}>连接设置</span>
              </div>
              <p style={subHint}>QwenPaw 地址（模块 5 自动发现 / 首次引导后存于此）：</p>
              <input
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                placeholder="http://localhost:8088"
                style={input}
                autoFocus
              />
              <button
                type="button"
                style={primaryBtn}
                onClick={() => void onSaveConnection()}
                disabled={checking}
              >
                {checking ? "连接中…" : "连接"}
              </button>
              {connMsg && (
                <p style={msgStyle(connMsg.startsWith("已连接") ? "var(--accent)" : "var(--danger-strong)")}>
                  {connMsg}
                </p>
              )}
            </div>
          )}

          {view === "shortcuts" && (
            <div style={subView}>
              <div style={subHeader}>
                <button type="button" style={backBtn} onClick={() => choose("menu")}>
                  ←
                </button>
                <span style={subTitle}>快捷键设置</span>
              </div>
              <ShortcutSettings onClose={() => setOpen(false)} />
            </div>
          )}

          {view === "update" && (
            <div style={subView}>
              <div style={subHeader}>
                <button type="button" style={backBtn} onClick={() => choose("menu")}>
                  ←
                </button>
                <span style={subTitle}>检查更新</span>
              </div>
              <p style={subHint}>当前版本 v{APP_VERSION}</p>
              <button type="button" style={primaryBtn} onClick={() => void onCheckUpdate()}>
                检查更新
              </button>
              {updateMsg && <p style={subHint}>{updateMsg}</p>}
            </div>
          )}

          {view === "about" && (
            <div style={subView}>
              <div style={subHeader}>
                <button type="button" style={backBtn} onClick={() => choose("menu")}>
                  ←
                </button>
                <span style={subTitle}>关于</span>
              </div>
              <p style={aboutName}>Paw Pad</p>
              <p style={subHint}>QwenPaw 轻量桌面助手 v{APP_VERSION}</p>
              <p style={subHint}>为高频对话而生的轻量窗口。</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const moreBtn: CSSProperties = {
  position: "relative",
  padding: "3px 9px",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  background: "var(--fill-weak)",
  color: "var(--text-meta)",
  font: '600 13px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  cursor: "pointer",
};

/** 小红点角标（有新版本时显示） */
const badge: CSSProperties = {
  position: "absolute",
  top: 2,
  right: 2,
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--dot-red)",
  boxShadow: "0 0 4px var(--dot-red-glow)",
};

const panel: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 60,
  width: 210,
  padding: 6,
  borderRadius: 10,
  background: "var(--bg-panel)",
  border: "1px solid var(--border-strong)",
  boxShadow: "var(--shadow-panel)",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const itemBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--text-meta)",
  font: '13px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  textAlign: "left",
  cursor: "pointer",
};

const itemIcon: CSSProperties = {
  flex: "none",
  width: 18,
  height: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-muted)",
};

const subView: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 4,
};

const subHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const subTitle: CSSProperties = {
  font: '600 13px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--text-primary)",
};

const subHint: CSSProperties = {
  margin: 0,
  font: '12px/1.5 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--text-dim)",
};

const aboutName: CSSProperties = {
  margin: 0,
  font: '600 15px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--text-primary)",
};

const backBtn: CSSProperties = {
  padding: "2px 8px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  background: "var(--fill-weak)",
  color: "var(--text-meta)",
  font: '12px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  cursor: "pointer",
};

const input: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-hover)",
  background: "var(--bg-input)",
  color: "var(--text-meta)",
  font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
  outline: "none",
};

const primaryBtn: CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid var(--border-hover)",
  background: "var(--fill-mid)",
  color: "var(--text-meta)",
  font: '12px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  cursor: "pointer",
};

function msgStyle(color: string): CSSProperties {
  return {
    margin: "2px 0 0",
    font: '11px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
    color,
    wordBreak: "break-all",
  };
}
