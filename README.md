# 🐾 Paw Pad

> QwenPaw 的轻量桌面入口 — Console 的补充，不是替代。

## 定位

Paw Pad 是 [QwenPaw](https://github.com/agentscope-ai/QwenPaw) 的轻量桌面客户端。Console 管配置和管理，Paw Pad 管日常即时交互。

**薄壳复用架构**：连接 `localhost:8088` 的 QwenPaw 后端，纯前端壳，不打包后端，全部复用 QwenPaw agent 能力。

## 技术栈

- **Tauri v2**（Rust 原生壳 + WebView）
- **React + TypeScript**（前端 UI）
- **Vite**（构建）
- **原生 macOS vibrancy**（Liquid Glass / NSVisualEffectView，非 CSS blur）

## 核心特性

- 🪟 **浮球**：桌面常驻浮球，单击呼出 / 右键弧形菜单 / 拖文件投放
- 💬 **轻量对话**：信息精简（只展示用户消息 + 最终答案 + 工具摘要）
- ⌨️ **Slash 命令**：复用 QwenPaw Console 原生 `/` 命令体系
- 📎 **文件交互**：@ 搜索 / 拖拽 / 粘贴 → 统一 upload
- 📷 **截图**：系统选区截图 → chip → 喂 agent
- ⚡ **快捷键**：呼出 / 截图 / 新建，可重设

## 开发

```bash
pnpm install
pnpm tauri dev
```

## 依赖

- [QwenPaw](https://github.com/agentscope-ai/QwenPaw) 后端运行在 `localhost:8088`

## License

MIT
