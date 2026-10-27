//! 模块 3（3.1/3.2）：截图（macOS 系统原生选区 UI）。
//!
//! 链路（不可商量）：
//!   📷 按钮 / ⌘⇧X → take_screenshot（Rust：screencapture -i -c 系统原生
//!   选区 UI → 剪贴板 PNG → 临时文件 → 返回路径）
//!     → 前端复用模块 2.4 统一 upload 链路（POST /api/console/upload）
//!     → chip（复用 FileChip）
//!
//! 3.2 行为：截图完成后 chip + 输入框聚焦等用户补话（不自动发送）；
//! screencapture 运行期间按钮变黄呼吸（前端 ScreenshotButton 持 capturing 态）。
//!
//! 快捷键：⌘⇧X（Cmd+Shift+X，避开系统 ⌘⇧4/5）→ emit("screenshot-requested")
//! → 前端进入截图中呼吸态并调 take_screenshot（与点 📷 同一前端路径）。
//! 注册必须在 std::thread::spawn 内——global-shortcut 插件内部
//! run_on_main_thread + rx.recv() 无主线程检查，setup（主线程）直接
//! on_shortcut 会死锁（事件循环未启动，任务永远执行不到；同 window.rs T2 教训）。

use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, EventTarget, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 全局快捷键：⌘⇧X。系统保留 ⌘⇧4（区域截图）/ ⌘⇧5（录屏），故避让。
const SCREENSHOT_SHORTCUT: &str = "Cmd+Shift+X";

/// 前端「截图中」呼吸态事件（快捷键命中 → emit 到主窗口 → 前端亮黄呼吸
/// 并调 take_screenshot，与点 📷 同一路径）。
const REQUEST_EVENT: &str = "screenshot-requested";

/// 截图成功结果（None = 用户 Esc 取消）。
#[derive(serde::Serialize)]
pub struct ScreenshotResult {
    /// 临时 PNG 绝对路径（前端 plugin-fs readFile 读字节 → upload）
    pub path: String,
    /// chip 展示文件名
    pub name: String,
}

/// 模块 3：执行一次截图。
///
/// - `screencapture -i -c`：-i 交互选区（系统原生 UI），-c 写入剪贴板。
///   进程阻塞到用户完成选区或 Esc 取消，故放 spawn_blocking 不占主线程。
/// - 退出码 0 → 剪贴板已有新 PNG → AppleScript 落临时文件 → 返回路径；
/// - 非 0（Esc 取消）→ 返回 None，**不读剪贴板**——否则会把取消前
///   剪贴板里的旧图片误当成本次截图。
#[tauri::command]
pub async fn take_screenshot(app: AppHandle) -> Result<Option<ScreenshotResult>, String> {
    tauri::async_runtime::spawn_blocking(move || capture_blocking(&app))
        .await
        .map_err(|e| format!("截图任务执行失败：{e}"))?
}

/// 截图阻塞体（跑在 blocking 线程池）。
fn capture_blocking(app: &AppHandle) -> Result<Option<ScreenshotResult>, String> {
    // 1) 系统原生选区 UI → 剪贴板（-i interactive，-c clipboard）
    let status = Command::new("screencapture")
        .arg("-i")
        .arg("-c")
        .status()
        .map_err(|e| format!("screencapture 启动失败：{e}"))?;
    if !status.success() {
        // Esc 取消（screencapture 退出码 1）或异常：统一视为未截图
        return Ok(None);
    }

    // 2) 剪贴板 PNG → 临时文件。
    //    AppleScript 经典 idiom：the clipboard as «class PNGf» 把剪贴板图片
    //    强制转 PNG data 再 write 落盘（2026-10-21 本机实测：PNG 进剪贴板
    //    再取出 byte-identical roundtrip）。
    let dir = app
        .path()
        .temp_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("paw-pad-screenshots");
    fs::create_dir_all(&dir).map_err(|e| format!("创建截图临时目录失败：{e}"))?;
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("系统时钟异常：{e}"))?
        .as_millis();
    let path = dir.join(format!("screenshot-{millis}.png"));
    let path_str = path.to_string_lossy().to_string();
    let script = format!(
        "set pngData to the clipboard as «class PNGf»\n\
         set f to open for access \"{path_str}\" with write permission\n\
         write pngData to f\n\
         close access f"
    );
    let status = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status()
        .map_err(|e| format!("osascript 启动失败：{e}"))?;
    if !status.success() {
        return Err("剪贴板读取失败：无 PNG 图片数据（或写入临时文件失败）".to_string());
    }
    let name = format!("screenshot-{millis}.png");
    Ok(Some(ScreenshotResult {
        path: path_str,
        name,
    }))
}

/// 注册全局快捷键 ⌘⇧X（Cmd+Shift+X）。
///
/// 必须在 std::thread::spawn 内调用——global-shortcut 插件内部
/// run_on_main_thread + rx.recv() 无主线程检查，setup（主线程）直接
/// on_shortcut 会死锁（事件循环未启动，任务永远执行不到；同 window.rs T2）。
/// 命中 → emit 到主窗口「screenshot-requested」→ 前端 ScreenshotButton
/// 进入截图中呼吸态并调 take_screenshot（与点 📷 同一路径）。
pub fn setup_shortcut(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = handle.global_shortcut().on_shortcut(
            SCREENSHOT_SHORTCUT,
            |app, _shortcut, event| {
                // 只认按下（Pressed），避免按下+抬起双触发
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                let _ = app.emit_to(EventTarget::webview_window("main"), REQUEST_EVENT, ());
            },
        ) {
            eprintln!("failed to register screenshot shortcut: {e}");
        }
    });
}
