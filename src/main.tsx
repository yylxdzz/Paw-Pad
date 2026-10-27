// e2e 基建（wdio）：注册 window.__TAURI__ 上的 wdio 前端桥（仅 debug 构建有 Rust 侧插件）
import "@wdio/tauri-plugin";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { restoreWindowState, startWindowStateTracking } from "./lib/window-state";

// 精确判断：浮球窗口在 Rust 侧创建（floating_orb.rs），App.tsx 内按 label 分流。
// 主窗口才做窗口状态恢复（4.2）。
void (async () => {
  let label = "main";
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    label = getCurrentWindow().label;
  } catch {
    // ignore
  }
  if (label === "floating_orb") return;
  await restoreWindowState();
  startWindowStateTracking();
})();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
