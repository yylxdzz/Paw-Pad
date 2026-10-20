mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    // e2e 基建（wdio）：仅 debug 构建内嵌 WebDriver HTTP server（embedded 模式，
    // @wdio/tauri-service 驱动 App 自己 spawn 的构建产物实例）。官方明确 test-only，
    // #[cfg(debug_assertions)] 门住——release 无此插件（依赖段同在 cfg 门下，
    // release 依赖图里根本不出现）。依据：本机笔记《Tauri 桌面应用自动化自测方案》五.1。
    #[cfg(debug_assertions)]
    let builder = builder
        .plugin(tauri_plugin_wdio_webdriver::init())
        .plugin(tauri_plugin_wdio::init());

    builder
        .setup(|app| {
            window::setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
