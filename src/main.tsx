// e2e 基建（wdio）：注册 window.__TAURI__ 上的 wdio 前端桥（仅 debug 构建有 Rust 侧插件）
import "@wdio/tauri-plugin";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
