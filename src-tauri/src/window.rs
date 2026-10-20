//! T2 窗口壳：Liquid Glass / vibrancy 背景 + 全局呼出/隐藏快捷键。
//!
//! D17：窗口背景透明由原生材质提供，不用 CSS backdrop-filter——双路径
//! （对齐 Atd NativeMaterialView 双版本策略）：
//! - macOS 26+（Liquid Glass 世代）：NSGlassEffectView（Regular style，自带
//!   light rim 边缘高光）+ radius 20pt；
//! - 旧系统回退 NSVisualEffectView（HudWindow 材质），B3 起显式声明
//!   NSVisualEffectState::FollowsWindowActiveState（窗口失焦时系统自动压暗）。

use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use window_vibrancy::{
    apply_liquid_glass, apply_vibrancy, LiquidGlassOptions, NSGlassEffectViewStyle,
    NSVisualEffectMaterial, NSVisualEffectState,
};

/// 全局呼出/隐藏快捷键（默认 Cmd+Shift+Space）
const TOGGLE_SHORTCUT: &str = "Cmd+Shift+Space";

pub fn setup(app: &mut tauri::App) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .expect("main window not found in setup");

    // D17：原生材质背景，macOS 专属；html/body CSS 层保持 transparent（材质从这透出）。
    // 冒烟三轮（Liquid Glass 升级）：macOS 26+（用户系统 macOS 27，Liquid Glass 世代）
    // 优先 NSGlassEffectView（Regular style，自带 light rim 边缘高光）+ 圆角 20pt，
    // 对齐 Atd 实证配方；apply_liquid_glass 内部有版本检测
    // （NSAppKitVersionNumber < 2685 返回 Err），失败回退 NSVisualEffectView
    // ——对齐 Atd NativeMaterialView 双版本策略，无需自己判版本：
    //   - 回退路径 = B3 起显式 FollowsWindowActiveState（失焦自动压暗、聚焦恢复）；
    //     此前第三参数传 None（默认 Active 常亮），失焦不变暗。
    #[cfg(target_os = "macos")]
    {
        let glass_result = apply_liquid_glass(
            &window,
            LiquidGlassOptions::new(NSGlassEffectViewStyle::Regular).radius(20.0),
        );
        if glass_result.is_err() {
            apply_vibrancy(
                &window,
                NSVisualEffectMaterial::HudWindow,
                Some(NSVisualEffectState::FollowsWindowActiveState),
                None,
            )
            .expect("failed to apply vibrancy to main window");
        }
    }

    // 全局快捷键：Cmd+Shift+Space 呼出/隐藏切换（Pressed 才动作，避免按下+抬起双触发）
    // 注意：必须放在 spawn 线程里注册——插件内部是 run_on_main_thread + rx.recv()，
    // 在主线程（setup）内直接调会死锁（事件循环还没跑起来，任务永远执行不到）。
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        if let Err(e) = handle.global_shortcut().on_shortcut(
            TOGGLE_SHORTCUT,
            |app, _shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(true) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            },
        ) {
            eprintln!("failed to register global shortcut: {e}");
        }
    });

    Ok(())
}
