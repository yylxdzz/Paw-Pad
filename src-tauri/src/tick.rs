//! 全局 5s 定时 tick：Rust 侧 loop 广播 "poll-tick" 事件。
//!
//! 为什么在 Rust 侧：macOS WKWebView 对不可见页面节流定时器——主窗口被
//! 用户 ❌ 藏起后，前端 setInterval（审批轮询 / 连接重连）停滞（2026-10-27
//! 实证：resolved 检测从 6s 劣化到 5 分钟）。Rust async 线程不受页面可见性
//! 影响。前端 listen("poll-tick") 驱动原 tick 逻辑，业务逻辑零改动。

use tauri::{Emitter, Runtime};

/// tick 间隔（与前端原 setInterval 一致：5s）
pub const TICK_INTERVAL_MS: u64 = 5000;

/// 启动全局 tick loop（幂等由调用方 setup 保证只调一次）。
pub fn start<R: Runtime>(app: &tauri::AppHandle<R>) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            // 睡眠源：原计划 tokio::time::sleep，但本 crate 的 Cargo.toml 没有
            // tokio 直接依赖（只在 Cargo.lock 里作为 tauri 的传递依赖存在），
            // Rust 不允许按名引用传递依赖 → `tokio::time::sleep` 编译不过；
            // tauri::async_runtime 也只 re-export 了 runtime/sync/task，没有
            // sleep。故改用 spawn_blocking 承载 std::thread::sleep（其返回的
            // JoinHandle 实现 Future，可直接 await）。
            let _ = tauri::async_runtime::spawn_blocking(|| {
                std::thread::sleep(std::time::Duration::from_millis(TICK_INTERVAL_MS));
            })
            .await;
            // emit 是同步实现（Manager::emit → listeners.emit_js 直接往各
            // webview eval JS），不要求在 runtime 上下文中调用，任意线程均可。
            let _ = handle.emit("poll-tick", ());
        }
    });
}
