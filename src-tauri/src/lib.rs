mod file_search;
mod floating_orb;
mod logger;
mod screenshot;
mod tick;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    // e2e 基建（wdio）：仅 debug 构建内嵌 WebDriver HTTP server（embedded 模式，
    // @wdio/tauri-service 驱动 App 自己 spawn 的构建产物实例）。官方明确 test-only，
    // #[cfg(debug_assertions)] 门住——release 无此插件（依赖段同在 cfg 门下，
    // release 依赖图里根本不出现）。依据：本机笔记《Tauri 桌面应用自动化自测方案》五.1。
    #[cfg(debug_assertions)]
    let builder = builder
        .plugin(tauri_plugin_wdio_webdriver::init())
        .plugin(tauri_plugin_wdio::init());

    let app = builder
        .setup(|app| {
            // 模块 6（6.3）：日志系统初始化（建目录 + 7 天清理 + panic hook）
            logger::init();
            // 全局 5s tick（Rust 侧 loop，不受 WebView 隐藏节流——审批轮询/连接重连的计时源）
            tick::start(app.handle());
            window::setup(app)?;
            // 模块 1（1.1）：桌面常驻浮球窗口，在主窗口配置就绪后创建。
            floating_orb::create_orb_window(app.handle())?;
            if let Some(orb) = app.get_webview_window("floating_orb") {
                floating_orb::listen_drag_drop(&orb);
            }
            // 模块 1（1.5）：弧形菜单开关 → 浮球窗口放大/缩回（弧带外半径 94
            // + 气泡右缘 157 超出 60×60 窗口被系统裁剪，展开时放到 340×340
            // 且浮球居中）。
            floating_orb::listen_menu_state(app.handle());
            // 模块 3（3.1）：全局快捷键 ⌘⇧X（Cmd+Shift+X）→ emit
            // "screenshot-requested" → 前端 📷 进入截图中呼吸态并调
            // take_screenshot（注册在 spawn 线程内，避开 global-shortcut
            // 插件主线程重入死锁，同 window.rs T2）。
            screenshot::setup_shortcut(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window::set_main_window_always_on_top,
            // 模块 1（1.4/1.8）：缩回终点——主窗 hide 收归 Rust 侧
            // （前端 hide 受 core:window:allow-hide ACL 拒绝，见 window.rs 注释）
            window::hide_main_window,
            // 模块 1（浮球系统）：右键弧形菜单四命令 + 拖放文件读取
            floating_orb::toggle_orb_pin,
            // 模块 1（图钉可视化）：启动时同步置顶态，重启后视觉与真实状态一致
            floating_orb::orb_pin_state,
            floating_orb::orb_new_session,
            floating_orb::orb_hide_main,
            // D36（2026-10-27 修订）：弧形菜单「隐藏」= 隐藏浮球自身
            floating_orb::orb_hide_orb,
            floating_orb::orb_exit_app,
            floating_orb::read_dropped_files,
            floating_orb::summon_main_window,
            // 模块 1（1.7）：浮球原生拖动（startDragging）+ 松手后点击/拖动裁决
            floating_orb::orb_begin_native_drag,
            // 模块 2（2.1）：@ 搜索补全（file_search.rs：glob+fuzzy，限 20 条）
            file_search::search_files,
            // 模块 3：截图（screenshot.rs：screencapture -i -c 系统选区 UI
            // → 剪贴板 PNG → 临时文件 → 前端走统一 upload → chip）
            screenshot::take_screenshot,
            // 模块 6（6.3/6.4）：日志（前端 UI 事件写入 / 导出最近 7 天 → 桌面）
            logger::log_frontend,
            logger::export_logs,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // D36（2026-10-27 修订）：Dock 栏 App 图标点击（macOS RunEvent::Reopen，
    // 无可见窗口时点 Dock 图标触发）→ 恢复浮球显示。「隐藏」菜单项藏掉浮球后，
    // 用户点 Dock 图标即在此恢复。
    let app_for_run = app;
    app_for_run.run(|handle, event| {
        // tauri 2.12.4 的 RunEvent::Reopen 是带 has_visible_windows 字段的结构体
        // 变体且 #[non_exhaustive]，模式必须写 { .. }（app.rs:279）。
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Some(orb) = handle.get_webview_window("floating_orb") {
                let _ = orb.show();
                let _ = orb.set_focus();
            }
        }
    });
}
