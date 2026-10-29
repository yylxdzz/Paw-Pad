//! T2 窗口壳：CSS 毛玻璃背景 + 全局呼出/隐藏快捷键。
//!
//! 方案 A（2026-10-24）：**不用原生 vibrancy / liquid glass**，窗口背景改由 CSS
//! `backdrop-filter` 提供（src/styles/app.css 的 `.app-shell`），原生侧只保留
//! transparent 窗口（tauri.conf.json）+ 阴影开关。
//!
//! 为什么去掉原生材质：NSVisualEffectView / NSGlassEffectView 的 backdrop 是
//! **窗口服务器侧表面**，窗口被 orderOut（tauri 的 hide()）后该表面不被回收，
//! 桌面上留一块与窗口等大的「浅灰/深色模糊矩形」——即用户报的「主窗 ❌ 缩回后
//! 残留浅灰窗口」。clear_vibrancy 返回 Ok(false) 摘不掉（2026-10-23 日志实证），
//! detach + 跨运行循环迭代 defer 也只能部分缓解。浮球窗口（transparent、无
//! vibrancy、shadow=false）同法 hide 不留任何残留可作对照——故方案 A 直接走
//! 「纯 CSS 毛玻璃」路线，桌面上没有任何原生 backdrop 表面可残留。
//!
//! 收益顺带：CSS 变量 + `prefers-color-scheme` 让主窗口浅/深色跟随系统
//! （原生 vibrancy 只提供材质、不提供前景色板，做不到浅色模式）。

use tauri::{Emitter, EventTarget, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 全局呼出/隐藏快捷键（默认 Cmd+Shift+Space）
const TOGGLE_SHORTCUT: &str = "Cmd+Shift+Space";

/// 模块 4（4.4）：主窗口置顶切换。供模块 1 弧形菜单调用（前端经
/// invoke("set_main_window_always_on_top", { alwaysOnTop: true })）。
/// 开 = 全屏 App 下可见；关 = 正常层级。默认不置顶（tauri.conf.json
/// 里 alwaysOnTop=false）。注：本命令只管主窗口；浮球始终置顶由模块 1 负责。
#[tauri::command]
pub fn set_main_window_always_on_top(
    app: tauri::AppHandle,
    always_on_top: bool,
) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(always_on_top)?;
        // 模块 6（6.3）：窗口原生事件记日志（元数据，无内容）
        crate::logger::info("window", &format!("main always_on_top={always_on_top}"));
    }
    Ok(())
}

/// 模块 1（1.4/1.8）：隐藏主窗口（缩回终点）。红绿灯 ❌ / Esc / 浮球菜单
/// 「隐藏」统一走此命令把主窗 orderOut——hide 不销毁，保证再单击浮球 /
/// ⌘⇧Space 能正常呼出。
///
/// 为什么由 Rust 侧 hide（原先是前端 `getCurrentWindow().hide()`）：
/// 前端 window 插件的 hide 命令受 ACL 管控，需要 `core:window:allow-hide`。
/// 而 capabilities/default.json（main 窗口）只授了 `core:default` →
/// `core:window:default`，该默认集里**只有** get-all-windows / scale-factor /
/// position / size / is-* / title / monitor 一族，**不含** allow-hide、
/// allow-show、allow-set-focus、allow-set-position（见 gen/schemas/
/// acl-manifests.json 的 core:window.default_permission）。浮球窗口的
/// capabilities/orb.json 则显式列了这几个 allow-*，所以 Orb 的
/// orb.hide()/orb.show() 一直正常，主窗口的 hide 却被 ACL 拒绝。
/// invoke reject 又被 App.tsx 的 `.catch(() => {})` 吞掉 → 主窗口不隐藏、
/// dev 日志无报错。Rust 侧 `window.hide()` 不经 ACL，且能落日志校验，
/// 故缩回的 hide 收归此处。
#[tauri::command]
pub fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    hide_main_window_on_main_thread(&app)
}

/// D38（2026-10-29）：缩回动画起点（0ms）即刻摘除主窗红绿灯按钮。
///
/// 为什么需要独立命令（而非沿用 hide_main_window 里的 D37 摘钮）：
/// 前端 recallMain() 的 280ms CSS 缩回动画会把 `.app-shell` 缩到 0——
/// 窗口主体从画面消失——但原生红绿灯（NSWindow standardWindowButtons）
/// 不受 CSS 管，动画尾段（约 130~280ms）只剩三颗按钮单独可见。
/// 30fps 录屏逐帧实证：残留约 140ms（4.53s~4.67s 共 4 帧），
/// 主体深色像素 4.53s 归零而红绿灯颜色簇 4.67s 才消失。
/// D37 在 hide_main_window（280ms 末尾）里摘钮：① 时机太晚（残留窗口
/// 130~280ms 已过）② 与 hide() 同 runloop pass 未被合成——双重无效。
///
/// 本命令只做 setHidden:YES（不 hide、不拆阴影）——由前端 recallMain()
/// 在动画启动同时 invoke，整个 280ms 缩回期间按钮已不可见。
/// 恢复按钮（setHidden:NO）仍在 summon_main 的 show 前主线程闭包（D37）。
#[tauri::command]
pub fn hide_traffic_lights(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let _ = app.run_on_main_thread(move || {
        set_standard_window_buttons_hidden(&window, true);
        crate::logger::info(
            "window",
            "D38: traffic lights hidden at recall start (0ms)",
        );
    });
    Ok(())
}

/// hide 主窗口的收尾，并保证 AppKit 视图操作跑在主线程。
///
/// 方案 A（2026-10-24）：主窗口已无原生 vibrancy / liquid glass 材质（改用 CSS
/// `backdrop-filter` 毛玻璃），桌面上没有任何 WindowServer backdrop 表面可残留 →
/// 不再需要「detach 视图 + 跨运行循环迭代 defer orderOut」那套两阶段收尾。
/// 只做两件事：关阴影（阴影也是窗口服务器侧表面，hide 后不留阴影晕）+ orderOut。
///
/// 前端 `invoke("hide_main_window")`（红绿灯 ❌ / Esc / 缩回终点）与浮球菜单
/// `orb_hide_main`（隐藏菜单项）共用此函数——两条 hide 路径行为完全一致。
pub fn hide_main_window_on_main_thread(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let window_for_main = window.clone();
    let _ = app.run_on_main_thread(move || {
        // D37：hide 前摘除 Overlay 标题栏红绿灯按钮。decorations:true +
        // titleBarStyle:"Overlay" + transparent:true 组合下，NSWindow orderOut 后
        // WindowServer 不回收 standardWindowButtons 的合成表面，桌面上残留
        // 「幽灵红绿灯」（2026-10-28 录屏复现 + 日志实证 hide 本身成功
        // is_visible=false，系统层缺陷非本应用 bug，见 D37）。窗口仍可见时
        // 先 setHidden:YES 强制主题框重绘移除按钮表面，再 orderOut 即无残留。
        set_standard_window_buttons_hidden(&window_for_main, true);
        // 阴影是窗口服务器侧表面：关掉，hide 后不留阴影晕。
        let _ = window_for_main.set_shadow(false);
        // transparent + 无原生材质 → orderOut 后桌面无残留（同浮球窗）。
        let res = window_for_main
            .hide()
            .map_err(|e| format!("hide main failed: {e}"));
        // 校验：hide 后 is_visible 应为 false。留痕便于定位（不再静默失败）。
        let visible = window_for_main.is_visible().unwrap_or(true);
        if visible {
            crate::logger::error("window", "hide main failed: still visible after hide()");
        }
        crate::logger::info(
            "window",
            &format!("recall main: hidden (is_visible={visible})"),
        );
        let _ = tx.send(res);
    });
    match rx.recv_timeout(std::time::Duration::from_secs(2)) {
        Ok(res) => res,
        Err(_) => {
            let msg = "hide main timed out waiting for main thread".to_string();
            crate::logger::error("window", &msg);
            Err(msg)
        }
    }
}

/// 模块 1（1.4/1.8）：呼出主窗口（快捷键 / 浮球 summon 路径共用）。
///
/// 位置计算（1.8 自适应）：
/// - 浮球权威位置取 Rust 侧落盘的 orb-position.json（显示器相对逻辑系），
///   缺失时回退浮球窗口实时位置（绝对物理系）；
/// - 浮球在屏幕左半 → 主窗贴浮球右侧出现（origin 右）；右半 → 贴左侧
///   （origin 左）；显示器物理坐标下做边界钳制（不超屏）。
/// emit("window-summon", { originX }) 后置顶显示——三段接力的 280ms 放大
/// 动画由主窗口前端播放（1.4，app-shell transform，不动窗口尺寸）。
pub fn summon_main(app: &tauri::AppHandle) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or(tauri::Error::WindowNotFound)?;
    let orb = app.get_webview_window("floating_orb");

    // 方案 A：无原生材质可挂回（背景由 CSS backdrop-filter 提供，hide/show 都跟着
    // 窗口走）。但 hide 时 set_shadow(false) 关掉的窗口阴影要在这里恢复——否则主窗
    // 第一次 hide 之后就再也没阴影了。run_on_main_thread 入队的 Task 与随后的
    // set_position/show 走同一条 proxy 队列（FIFO），故阴影一定先于窗口显示设好，
    // 不会闪一下「无阴影」的裸窗。
    let window_for_shadow = window.clone();
    let _ = app.run_on_main_thread(move || {
        // D37：对称恢复上次 hide 时摘除的红绿灯按钮。与 set_shadow(true) 同处一个
        // 主线程 Task，先于随后的 set_position/show 执行（proxy 队列 FIFO），
        // 不会闪一下「无按钮」裸窗。
        set_standard_window_buttons_hidden(&window_for_shadow, false);
        let _ = window_for_shadow.set_shadow(true);
    });

    // 浮球权威位置（显示器相对逻辑系）
    let (lx, ly) = {
        let mut pos: Option<(f64, f64)> = None;
        if let Ok(dir) = app.path().app_config_dir() {
            if let Ok(raw) = std::fs::read_to_string(dir.join("orb-position.json")) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                    let x = v.get("x").and_then(|v| v.as_f64());
                    let y = v.get("y").and_then(|v| v.as_f64());
                    if let (Some(x), Some(y)) = (x, y) {
                        pos = Some((x, y));
                    }
                }
            }
        }
        pos.unwrap_or((0.0, 0.0))
    };

    // 显示器（逻辑↔物理换算基准）
    let monitor = orb
        .as_ref()
        .and_then(|o| o.current_monitor().ok())
        .flatten();
    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let m_pos = monitor.as_ref().map(|m| m.position());
    let m_w = monitor.as_ref().map(|m| m.size().width as f64).unwrap_or(0.0);

    // 浮球物理坐标：逻辑位置经显示器换算
    let (px_orb, py_orb) = match &m_pos {
        Some(m) => (m.x as f64 + lx * scale, m.y as f64 + ly * scale),
        None => (lx * scale, ly * scale),
    };

    let size = window.outer_size()?;
    // 可见区底（物理坐标，避开 Dock）：monitor.work_area() 即系统可见工作区
    // （macOS = NSScreen.visibleFrame，已排除 Dock 与菜单栏）。有效时直接采用——
    // Dock 显示则可见区底 < 屏底（避开 Dock），Dock 隐藏则 == 屏底（无需避让）；
    // 仅当 work_area 退化（未填充为 0）才回退到屏底。
    let visible_bottom = match &monitor {
        Some(m) => {
            let mon_bottom = m.position().y as f64 + m.size().height as f64;
            let work = m.work_area();
            let work_bottom = work.position.y as f64 + work.size.height as f64;
            if work_bottom > 0.0 && work_bottom <= mon_bottom {
                work_bottom
            } else {
                mon_bottom
            }
        }
        None => f64::INFINITY,
    };
    // 出现侧（1.8）：左半屏 → 主窗贴浮球右侧出现（origin 右）；
    // 右半屏 → 贴浮球左侧出现（origin 左，60px 窗口留出浮球让位）。
    let (mut px, origin_x) = match &m_pos {
        Some(m) if px_orb > m.x as f64 + m_w / 2.0 => {
            (px_orb - size.width as f64 + 60.0 * scale, "left")
        }
        _ => (px_orb, "right"),
    };
    // y：默认贴着浮球（py_orb）出现，保持「贴着浮球出现」的设计意图。
    let mut py = py_orb;
    if let Some(m) = &m_pos {
        // 边界检测：不超屏（物理坐标）
        let min_x = m.x as f64 + 12.0;
        let max_x = m.x as f64 + m_w - size.width as f64 - 12.0;
        px = px.clamp(min_x, max_x.max(min_x));
        // y 钳制避开 Dock：使主窗底（py + 高）不超可见区底——贴着浮球但若会伸进
        // Dock 则上移，主窗底贴 Dock 上沿。min_y 仅防越出屏顶（不改变贴浮球行为）。
        let min_y = m.y as f64;
        let max_y = visible_bottom - size.height as f64;
        py = py.clamp(min_y, max_y.max(min_y));
    }
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: px as i32,
        y: py as i32,
    }));
    let _ = app.emit_to(
        EventTarget::webview_window("main"),
        "window-summon",
        serde_json::json!({
            "originX": origin_x,
            "width": size.width as f64,
            "height": size.height as f64,
        }),
    );
    window.show()?;
    window.set_focus()?;
    // 模块 6（6.3）：呼出事件记日志（元数据）
    crate::logger::info("window", &format!("summon main (origin_x={origin_x})"));
    Ok(())
}


/// D37（2026-10-29）：Overlay 标题栏红绿灯按钮的摘除/恢复。
///
/// 根因：main 窗口 `decorations:true + titleBarStyle:"Overlay" + transparent:true`
/// （tauri.conf.json）组合下，NSWindow orderOut（tauri hide()）后 WindowServer
/// 不回收 standardWindowButtons 的合成表面——桌面上残留三个「幽灵红绿灯」。
/// 2026-10-28 用户录屏 + 日志双重实证：hide 本身成功（is_visible=false）、
/// 残留与鼠标位置/hover 无关（Esc + 鼠标远离同样残留），属 AppKit/WindowServer
/// 系统层缺陷，非本应用代码 bug（同族：原生 vibrancy 残留浅灰矩形，见本文件
/// 模块 doc 方案 A）。
///
/// 绕法：hide 前在窗口仍可见时把三颗按钮 `setHidden:YES`（强制主题框重绘，
/// 按钮表面在窗口还在屏上时被正常移除），再 orderOut；show 前对称恢复
/// `setHidden:NO`。零新增依赖——复用 floating_orb.rs 同款 libobjc runtime
/// 原语（sel_registerName + objc_msgSend）；不引 objc2 feature（会连锁重编译
/// tao，见记忆「work_area 地雷」）。
///
/// NSWindowButton：Close=0 / Miniaturize=1 / Zoom=2（zoom 可能被禁用返回 nil，
/// 逐个判空）。调用方须保证在主线程调用（hide/show 收尾均在
/// run_on_main_thread 闭包内）。
#[cfg(target_os = "macos")]
fn set_standard_window_buttons_hidden<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
    hidden: bool,
) {
    let Ok(ns_window) = window.ns_window() else {
        crate::logger::error(
            "window",
            "D37 standard buttons: ns_window handle unavailable, skip",
        );
        return;
    };
    let flag: usize = if hidden { 1 } else { 0 };
    unsafe {
        unsafe extern "C" {
            fn sel_registerName(name: *const u8) -> *const std::os::raw::c_void;
            fn objc_msgSend(
                receiver: *mut std::os::raw::c_void,
                selector: *const std::os::raw::c_void,
                arg: usize,
            );
        }
        let ns_window = ns_window as *mut std::os::raw::c_void;
        // standardWindowButton: 需要返回值（NSButton*）。objc_msgSend 声明与
        // floating_orb.rs 保持同签名（void 返回）避免跨模块 redeclared 警告，
        // 按 floating_orb.rs getter 同款 transmute 手法取带返回值的函数指针。
        let msg_send: unsafe extern "C" fn(
            *mut std::os::raw::c_void,
            *const std::os::raw::c_void,
            usize,
        ) = objc_msgSend;
        let get_button: unsafe extern "C" fn(
            *mut std::os::raw::c_void,
            *const std::os::raw::c_void,
            usize,
        ) -> *mut std::os::raw::c_void = std::mem::transmute(msg_send as usize);
        let sel_btn = sel_registerName(b"standardWindowButton:\0".as_ptr());
        let sel_hide = sel_registerName(b"setHidden:\0".as_ptr());
        // SAFETY: ns_window 是本进程有效 NSWindow 指针；standardWindowButton: 收
        // NSUInteger 返回 NSButton*（可能 nil）；setHidden: 的 BOOL 按 0/1 传入
        // （arm64 AAPCS64 寄存器低 8 位一致）。本函数仅在主线程被调用（AppKit
        // 约束）。
        for i in 0..3usize {
            let button = get_button(ns_window, sel_btn, i);
            if !button.is_null() {
                objc_msgSend(button, sel_hide, flag);
            }
        }
        crate::logger::info(
            "window",
            &format!("D37 standard buttons hidden={hidden}"),
        );
    }
}

#[cfg(not(target_os = "macos"))]
fn set_standard_window_buttons_hidden<R: Runtime>(
    _window: &tauri::WebviewWindow<R>,
    _hidden: bool,
) {
}

pub fn setup(app: &mut tauri::App) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .expect("main window not found in setup");

    // 方案 A（2026-10-24）：**不挂任何原生材质**。窗口背景的毛玻璃由 CSS
    // `backdrop-filter` 提供（src/styles/app.css 的 `.app-shell`：
    // blur(20px) saturate(1.2) + var(--bg-main)），html/body 保持 transparent，
    // 窗口本身 transparent（tauri.conf.json）——从桌面透出并被 CSS 模糊。
    // 原生 vibrancy / liquid glass 全链路已删（见本文件模块 doc）：它们的 backdrop
    // 是窗口服务器侧表面，hide 后不回收 = 桌面浅灰残留，且无法做浅色模式。
    // 圆角 20px 也由 CSS `.app-shell { border-radius: 20px }` 负责。

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
                // 模块 1（1.4）：走三段接力——直接调 summon_main，让浮球与主窗
                // 的呼出动画（120/280/150ms）完整播放；此处不再裸 show/hide。
                let _ = summon_main(app);
            },
        ) {
            eprintln!("failed to register global shortcut: {e}");
        }
    });

    // 红绿灯 ❌ 拦截：默认 CloseRequested 会销毁主窗口（Tauri 原生 close），
    // 导致 ① 无缩回浮球动画（直接消失）② 窗口销毁后再单击浮球/⌘⇧Space
    // 呼出失败（窗口实例已不存在）。故 prevent_close() 阻止销毁，改 emit
    // "window-recall" 让前端走 recallMain()（主窗收缩 + 浮球 spring 弹回 +
    // hide 不销毁，与 Esc 一致）。应用级退出仍走浮球菜单 orb_exit_app
    // （app.exit(0)，不经 CloseRequested）。
    let recall_app = app.handle().clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = recall_app.emit_to(
                EventTarget::webview_window("main"),
                "window-recall",
                (),
            );
            // 模块 6（6.3）：红绿灯缩回事件记日志（元数据）
            crate::logger::info("window", "red light close requested -> recall main");
        }
    });

    Ok(())
}
