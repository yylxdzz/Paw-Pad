//! 模块 1：桌面常驻浮球系统（Rust 原生壳侧）。
//!
//! 职责：
//! - 创建 60px 原生浮球窗口（transparent + always_on_top + skip_taskbar），
//!   窗口内 WebView 承载 Orb.tsx（50px 圆形浮球 + 约 60px 透明命中区）；
//!   右键弧形菜单展开时窗口临时放大到 ORB_MENU_WINDOW_SIZE（340px）并保持
//!   浮球居中，收起时缩回 60px（弧带外半径 94 + 气泡右缘 157 超出 60px
//!   会被系统裁剪，见 listen_menu_state）；
//! - 浮球位置持久化：每次移动落盘 orb-position.json（app_config_dir），
//!   启动时恢复；移动后向前端 emit("orb-position")，主窗口据此自适应出现位置；
//! - 浮球↔主窗口联动事件：orb-recall（主窗缩回完成、请求浮球弹回）、
//!   window-summon（主窗据此播放 280ms 放大动画；呼出入口 =
//!   summon_main_window 命令 / 全局快捷键，均走 window::summon_main）；
//! - dragDropEnabled(false)：原生拖放关闭，由前端 tauri://drag-enter/
//!   drop 事件实现文件投放（透明命中区约 60px）。
//!
//! 菜单命令见 lib.rs（模块 1 五命令）与 App.tsx / Orb.tsx。

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, EventTarget, Listener, Manager, Runtime, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};

/// 浮球原生窗口边长（逻辑像素）：内承载 50px 浮球视觉 + 约 60px 透明命中区。
pub const ORB_WINDOW_SIZE: f64 = 60.0;

/// 弧形菜单展开态的浮球窗口边长（逻辑像素）。
///
/// 1.5 修复（运行验证 A1）：60×60 窗口装不下 v6 弧带——弧带外半径 94px，
/// 悬浮标签气泡还需 16px 偏移 + 约 141px 宽（实测最宽项「新建 · 新建
/// Session」141.2px，右缘距浮球中心 157.2px；镜像侧 147.2px），两者都超出
/// 30px 的半窗被系统裁剪。故菜单展开时把窗口放大到 340×340（半窗 170px，
/// 对 157.2px 留约 13px 余量），浮球居中；收起时缩回 60×60 并保持浮球
/// 中心不动。
pub const ORB_MENU_WINDOW_SIZE: f64 = 340.0;

/// 位置持久化文件名（存于 app_config_dir）。
const ORB_POSITION_FILE: &str = "orb-position.json";

/// 浮球「置顶」菜单项的运行时状态（false = 跟随主窗口设置，浮球恒置顶不受影响——
/// 本标志只表达菜单勾选态）。
static ORB_PINNED: AtomicBool = AtomicBool::new(false);

/// 原生拖动期间的窗口 Moved 事件计数（拖动前清零、松手后读取）。
///
/// 为什么需要它：`outer_position()` 在 transparent + always_on_top 窗口上并非
/// 100% 可信（历史上出现过读完位置与拖动前一致、把拖动误判成点击 → 误呼出主窗），
/// 而 tao 的 `WindowEvent::Moved` 是 NSWindow 委托在窗口服务器真正移动窗口时
/// 同步投递的，与位置读取是否异常无关。故拖动判定采用「双证据」：
///   moved_events > 0（Moved 计数）或位置位移 ≥ 阈值 → 拖动；两者皆无 → 点击。
static ORB_DRAG_MOVE_COUNT: AtomicUsize = AtomicUsize::new(0);

#[derive(Serialize, Deserialize, Clone)]
struct OrbPosition {
    x: f64,
    y: f64,
}

fn position_file_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(ORB_POSITION_FILE))
}

/// 从磁盘恢复浮球位置；无记录 / 解析失败时返回 None（调用方落默认角落）。
fn read_saved_position<R: Runtime>(app: &AppHandle<R>) -> Option<(f64, f64)> {
    let path = position_file_path(app)?;
    let raw = fs::read_to_string(path).ok()?;
    let parsed: OrbPosition = serde_json::from_str(&raw).ok()?;
    Some((parsed.x, parsed.y))
}

fn save_position<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64) {
    if let Some(path) = position_file_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string(&OrbPosition { x, y }) {
            let _ = fs::write(path, json);
        }
    }
}

/// 创建桌面常驻浮球窗口（label: "floating_orb"）。
///
/// 约束（不可商量）：transparent + always_on_top + skip_taskbar；
/// 桌面常驻、不进 Dock/任务栏、始终置顶。
pub fn create_orb_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.get_webview_window("floating_orb").is_some() {
        return Ok(());
    }

    // dev-only 演示模式：PAWPAD_ORB_DEMO=1 启动时 URL 带 ?demo=1，前端 Orb.tsx
    // 据此循环播放 7 态（用户查看真实渲染效果用）；正常启动零影响。
    let orb_url = if std::env::var("PAWPAD_ORB_DEMO").as_deref() == Ok("1") {
        "index.html?demo=1".to_string()
    } else {
        "index.html".to_string()
    };
    let builder = WebviewWindowBuilder::new(app, "floating_orb", WebviewUrl::App(orb_url.into()))
        .title("Paw Pad Orb")
        .inner_size(ORB_WINDOW_SIZE, ORB_WINDOW_SIZE)
        // 只锁下限（不低于命中区），不锁上限——菜单展开时要 set_size 到
        // ORB_MENU_WINDOW_SIZE（macOS setContentSize 受 contentMaxSize 钳制，
        // 若 max=60 则放大被静默夹回 60，弧带仍被裁剪，故此处不设 max）。
        .min_inner_size(ORB_WINDOW_SIZE, ORB_WINDOW_SIZE)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(false)
        .focused(true)
        .visible(true);

    let orb = builder.build()?;

    // 位置恢复：有记录落记录处，无记录落当前显示器右侧垂直居中。
    let saved = read_saved_position(app);
    let orb_for_restore = orb.clone();
    tauri::async_runtime::spawn(async move {
        if let Some((x, y)) = saved {
            let _ = orb_for_restore
                .set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
        } else if let Ok(Some(monitor)) = orb_for_restore.current_monitor() {
            let scale = monitor.scale_factor();
            let m = monitor.position();
            let size = monitor.size();
            let x = m.x as f64 / scale + (size.width as f64 / scale - ORB_WINDOW_SIZE) / 2.0;
            let y = m.y as f64 / scale + (size.height as f64 / scale - ORB_WINDOW_SIZE) / 2.0;
            let _ = orb_for_restore
                .set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            let app = orb_for_restore.app_handle().clone();
            save_position(&app, x, y);
        }
    });

    // 位置持久化 + 广播：窗口移动（用户拖动或吸附）后落盘并 emit，
    // 主窗口监听 orb-position 计算出现位置（1.8 自适应）。
    let app_handle = app.clone();
    orb.on_window_event(move |event| {
        if let WindowEvent::Moved(pos) = event {
            // 原生拖动证据：窗口服务器每移动一次窗口投递一条 Moved（拖动判定用，
            // 见 orb_finish_native_drag）。必须同步递增——原生拖动期间本回调在
            // performWindowDragWithEvent 的嵌套循环里被调用，异步任务来不及排。
            ORB_DRAG_MOVE_COUNT.fetch_add(1, Ordering::SeqCst);
            let app = app_handle.clone();
            let pos = pos.clone();
            tauri::async_runtime::spawn(async move {
                // 菜单展开态（窗口被放大到 ORB_MENU_WINDOW_SIZE）不落盘也不广播：
                // 落盘的必须是 60×60 命中区左上角，否则重启后浮球整体偏移半窗。
                if !is_orb_at_rest_size(&app).await {
                    return;
                }
                let (x, y) = match orb_physical_to_logical(&app, pos.x as f64, pos.y as f64).await {
                    Some(p) => p,
                    None => (pos.x as f64, pos.y as f64),
                };
                save_position(&app, x, y);
                let _ = app.emit_to(
                    EventTarget::webview_window("main"),
                    "orb-position",
                    OrbPosition { x, y },
                );
            });
        }
    });

    Ok(())
}

/// 绝对物理坐标 → 显示器相对逻辑坐标（setPosition 逻辑系语义）。
/// 前端 snapshotToCorner 也按此系计算，二者保持一致。
async fn orb_physical_to_logical<R: Runtime>(
    app: &AppHandle<R>,
    px: f64,
    py: f64,
) -> Option<(f64, f64)> {
    let orb = app.get_webview_window("floating_orb")?;
    let monitor = orb.current_monitor().ok()??;
    let scale = monitor.scale_factor();
    let m = monitor.position();
    Some(((px - m.x as f64) / scale, (py - m.y as f64) / scale))
}

/// 浮球窗口是否处于常态 60×60（菜单收起态）。
///
/// 菜单展开时窗口被放大到 ORB_MENU_WINDOW_SIZE，此时的 Moved 位置是
/// 放大后窗口的左上角而非命中区位置，落盘会污染 orb-position.json
/// （重启后浮球整体偏移半个窗口），故调用方据此跳过持久化。
async fn is_orb_at_rest_size<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Some(orb) = app.get_webview_window("floating_orb") else {
        return true;
    };
    let scale = orb.scale_factor().unwrap_or(1.0);
    match orb.outer_size() {
        Ok(size) => {
            let w = size.width as f64 / scale;
            (w - ORB_WINDOW_SIZE).abs() < 1.0
        }
        Err(_) => true,
    }
}

/// 监听拖放事件（浮球窗口专用，仅在该窗口上注册）。
///
/// dragDropEnabled(false) 后 wry 不再消费 drop；drag-over 上 preventDefault
/// 声明命中区可接收，drop 由 Orb.tsx 读取路径并走 upload。
pub fn listen_drag_drop<R: Runtime>(orb: &tauri::WebviewWindow<R>) {
    let window = orb.clone();
    orb.listen("tauri://drag-enter", move |_event| {
        let _ = window.emit_to(
            EventTarget::webview_window("floating_orb"),
            "orb-drag-state",
            true,
        );
    });
    let window = orb.clone();
    orb.listen("tauri://drag-over", move |event| {
        let _ = window.emit_to(
            EventTarget::webview_window("floating_orb"),
            "orb-drag-state",
            true,
        );
    });
    let window = orb.clone();
    orb.listen("tauri://drag-leave", move |_event| {
        let _ = window.emit_to(
            EventTarget::webview_window("floating_orb"),
            "orb-drag-state",
            false,
        );
    });
    let window = orb.clone();
    orb.listen("tauri://drop", move |event| {
        let _ = window.emit_to(
            EventTarget::webview_window("floating_orb"),
            "orb-drop",
            event.payload(),
        );
    });
}

/// 前端弧形菜单开关事件名（Orb.tsx 在 menuOpen 变化时 emit({ open })）。
const ORB_MENU_EVENT: &str = "orb-menu-state";

/// 监听前端弧形菜单开关 → 浮球窗口尺寸联动（1.5 修复 A1：菜单被窗口裁剪）。
///
/// Orb.tsx 的 menuOpen 变化时 emit("orb-menu-state", { open })（JS emit 走
/// event 插件 → app.emit，Rust 侧 app.listen 收得到）；此处据此把浮球窗口
/// set_size 到 ORB_MENU_WINDOW_SIZE 340×340（展开，容纳弧带外半径 94 +
/// 气泡右缘 157）或 60×60（收起），并以浮球中心为锚同步 set_position——
/// 弧带/气泡不再被系统裁剪，浮球也不跳位。
pub fn listen_menu_state<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.listen(ORB_MENU_EVENT, move |event| {
        let open = serde_json::from_str::<serde_json::Value>(event.payload())
            .ok()
            .and_then(|v| v.get("open").and_then(|o| o.as_bool()))
            .unwrap_or(false);
        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            resize_orb_for_menu(&handle, open);
        });
    });
}

/// 按菜单开关重排浮球窗口：放大 / 缩回，并保持浮球屏幕中心不动。
fn resize_orb_for_menu<R: Runtime>(app: &AppHandle<R>, open: bool) {
    let Some(orb) = app.get_webview_window("floating_orb") else {
        return;
    };
    let scale = orb
        .scale_factor()
        .ok()
        .filter(|s| *s > 0.0)
        .unwrap_or(1.0);
    let (Ok(pos), Ok(size)) = (orb.outer_position(), orb.outer_size()) else {
        return;
    };
    // 浮球中心（物理像素）：窗口尺寸变化以它为锚，视觉上不跳位。
    let cx = pos.x as f64 + size.width as f64 / 2.0;
    let cy = pos.y as f64 + size.height as f64 / 2.0;
    let side = if open {
        ORB_MENU_WINDOW_SIZE
    } else {
        ORB_WINDOW_SIZE
    } * scale;
    let _ = orb.set_size(tauri::Size::Physical(tauri::PhysicalSize {
        width: side.round() as u32,
        height: side.round() as u32,
    }));
    let _ = orb.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: (cx - side / 2.0).round() as i32,
        y: (cy - side / 2.0).round() as i32,
    }));
}

/// 把浮球移到指定逻辑坐标（越界时夹回显示器内），供吸附 / 呼出自适应调用。
pub fn move_orb_to<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64) -> tauri::Result<()> {
    let orb = app
        .get_webview_window("floating_orb")
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    orb.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))?;
    save_position(app, x, y);
    let _ = app.emit_to(
        EventTarget::webview_window("main"),
        "orb-position",
        OrbPosition { x, y },
    );
    Ok(())
}

/// 浮球「置顶」菜单项：切换主窗口置顶（浮球恒置顶不受影响）。
///
/// 返回切换后的状态（true = 置顶中）供前端图钉可视化；不再由前端乐观 toggle，
/// 避免前后端状态漂移（重启后 Rust 侧状态仍在，前端 useState 却重置为 false）。
#[tauri::command]
pub fn toggle_orb_pin(app: tauri::AppHandle) -> bool {
    let next = !ORB_PINNED.load(Ordering::SeqCst);
    ORB_PINNED.store(next, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("main") {
        // 1) level：Normal(0) ↔ Floating(3)。tauri 原生、稳定切层级。
        //    Ok/Err 都显式落日志——「置顶没生效」时必须能看出层级到底切没切。
        match window.set_always_on_top(next) {
            Ok(()) => crate::logger::info(
                "orb",
                &format!("pin toggle set_always_on_top({next}) = Ok"),
            ),
            Err(e) => crate::logger::error(
                "orb",
                &format!("pin toggle set_always_on_top({next}) failed: {e}"),
            ),
        }
        // 2) collectionBehavior：macOS 全屏 App 独占一个 Space，仅把 level 切到
        //    Floating(3) 窗口不会跟着跳过去、仍被全屏 App 盖住——这就是「点了置顶
        //    没反应」。置顶时附加 CanJoinAllSpaces|FullScreenAuxiliary 让主窗跟随
        //    到所有 Space 并伴随全屏 App；取消置顶清空。详见 helper。
        set_main_pin_collection_behavior(&app, &window, next);
        crate::logger::info(
            "orb",
            &format!(
                "pin toggle -> main always_on_top={next} collectionBehavior={} (over-fullscreen {})",
                if next { MAIN_PIN_COLLECTION_BEHAVIOR } else { 0 },
                if next { "visible" } else { "covered" },
            ),
        );
    }
    next
}

/// 主窗口「置顶中」附加的 NSWindowCollectionBehavior：跟随到所有 Space（含全屏
/// App 的 Space）+ 可伴随全屏 App。
///   NSWindowCollectionBehaviorCanJoinAllSpaces    = 1<<0 = 1
///   NSWindowCollectionBehaviorFullScreenAuxiliary = 1<<8 = 256
const MAIN_PIN_COLLECTION_BEHAVIOR: usize = 1 | 256;

/// 让「置顶」在全屏 App 下真正可感知。
///
/// 根因：`set_always_on_top` 只切 window level（Normal↔Floating），而 macOS 全屏
/// App 独占一个 Space，level 3 的窗口不会自动跳到那个 Space，于是置顶/不置顶都被
/// 全屏 App 盖住（用户实测「点了没反应」）。故置顶时显式给主窗附加
/// collectionBehavior（跨 Space + 伴随全屏），取消置顶清空，使主窗在全屏 App 下
/// 「可见 / 被盖住」有明确差异。
///
/// `NSWindow.setCollectionBehavior:` 是 AppKit 操作，必须在主线程跑；此处**不引入
/// 新 objc2 feature**（会连锁重编译 tao，见记忆「work_area 地雷」），直接用 libobjc
/// runtime 原语（sel_registerName + objc_msgSend），零新增依赖。
#[cfg(target_os = "macos")]
fn set_main_pin_collection_behavior<R: Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
    pinned: bool,
) {
    let Ok(ns_window) = window.ns_window() else {
        crate::logger::error("orb", "pin: ns_window handle unavailable, skip collectionBehavior");
        return;
    };
    // 裸指针 !Send，不能直接移进 run_on_main_thread 闭包；用 usize 中转。
    let ns_window_addr = ns_window as usize;
    let behavior = if pinned { MAIN_PIN_COLLECTION_BEHAVIOR } else { 0 };
    let _ = app.run_on_main_thread(move || {
        let ns_window = ns_window_addr as *mut std::os::raw::c_void;
        // SAFETY: ns_window 是本进程有效 NSWindow 指针；setCollectionBehavior: 收一个
        // NSUInteger、void 返回，主线程调用符合 AppKit 约束。objc_msgSend 以 3 参固定
        // 声明调用（self→x0/_cmd→x1/arg→x2），对标量入参与 variadic 版等价。
        unsafe {
            unsafe extern "C" {
                fn sel_registerName(name: *const u8) -> *const std::os::raw::c_void;
                fn objc_msgSend(
                    receiver: *mut std::os::raw::c_void,
                    selector: *const std::os::raw::c_void,
                    arg: usize,
                );
            }
            let sel = sel_registerName(b"setCollectionBehavior:\0".as_ptr());
            objc_msgSend(ns_window, sel, behavior);
            // 回读校验：collectionBehavior getter 是 2 参 / 返回 NSUInteger，与上面的
            // 3 参 setter 原型不同。同一个符号不能声明两个名字，故先把 objc_msgSend
            // 收成函数指针、取地址，再 transmute 成 2 参原型调用（arm64 AAPCS64：
            // x0/x1 入参、x0 返回，换原型不改变调用约定）。
            let setter: unsafe extern "C" fn(
                *mut std::os::raw::c_void,
                *const std::os::raw::c_void,
                usize,
            ) = objc_msgSend;
            let getter: unsafe extern "C" fn(
                *mut std::os::raw::c_void,
                *const std::os::raw::c_void,
            ) -> usize = std::mem::transmute(setter as usize);
            let sel_get = sel_registerName(b"collectionBehavior\0".as_ptr());
            let readback = getter(ns_window, sel_get);
            crate::logger::info(
                "orb",
                &format!(
                    "main collectionBehavior set={behavior} readback={readback} (pinned={pinned})"
                ),
            );
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn set_main_pin_collection_behavior<R: Runtime>(
    _app: &tauri::AppHandle<R>,
    _window: &tauri::WebviewWindow<R>,
    _pinned: bool,
) {
}

/// 浮球「置顶」菜单项的当前状态（前端 Orb.tsx 启动时同步一次，
/// 保证重启后图钉视觉与 Rust 侧真实置顶态一致）。
#[tauri::command]
pub fn orb_pin_state() -> bool {
    ORB_PINNED.load(Ordering::SeqCst)
}

/// 浮球「新建」菜单项：让主窗口新建会话（主窗口持有会话逻辑）。
#[tauri::command]
pub fn orb_new_session(app: tauri::AppHandle) {
    let _ = app.emit_to(EventTarget::webview_window("main"), "orb-command", "new-session");
}

/// 浮球「隐藏」菜单项：主窗口隐藏、浮球重新待命。
///
/// 与 hide_main_window 同一收尾路径：set_shadow(false) + orderOut。方案 A 起主窗口
/// 无原生 vibrancy / liquid glass 材质（改 CSS backdrop-filter），桌面上没有
/// WindowServer backdrop 表面可残留——原先「hide 后残留浅灰矩形」的问题随之消失
/// （2026-10-23 实证见 window.rs 模块 doc）。
#[tauri::command]
pub fn orb_hide_main(app: tauri::AppHandle) {
    // 与前端 hide_main_window 命令走同一条主线程安全收尾：set_shadow(false) +
    // orderOut，并做 is_visible 校验。不在命令线程裸调收尾（AppKit 视图操作必须在
    // 主线程），也保证浮球菜单这条 hide 路径与红绿灯/Esc 路径行为完全一致。
    if let Err(e) = crate::window::hide_main_window_on_main_thread(&app) {
        crate::logger::error("orb", &format!("orb hide main failed: {e}"));
    }
}

/// D36（2026-10-27 修订）：弧形菜单「隐藏」= 隐藏浮球窗口自身。
/// 恢复路径 = 用户点 Dock 栏 App 图标 → RunEvent::Reopen（lib.rs）→ show 浮球。
#[tauri::command]
pub fn orb_hide_orb(app: tauri::AppHandle) {
    if let Some(orb) = app.get_webview_window("floating_orb") {
        let _ = orb.hide();
    }
}

/// 浮球「退出」菜单项：整应用退出。
#[tauri::command]
pub fn orb_exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// 模块 1（1.4）：浮球点击/投放/菜单「新建」请求呼出主窗口——
/// 复用 window 模块的位置计算（1.8 自适应）与三段接力广播。
#[tauri::command]
pub fn summon_main_window(app: tauri::AppHandle) {
    let _ = crate::window::summon_main(&app);
}

/// 拖动位移阈值（逻辑像素）：原生拖动松手后窗口位移小于它、且期间没有 Moved 事件，
/// 才算「点击」。与前端 Orb.tsx 的 DRAG_START_THRESHOLD（发起原生拖动的阈值）配套。
const ORB_CLICK_THRESHOLD: f64 = 4.0;

/// 原生拖动结束事件名（Rust 松手后 emit 给浮球前端，负载 { dragged: bool }）。
const ORB_DRAG_END_EVENT: &str = "orb-native-drag-end";

/// 浮球原生拖动入口（前端 Orb.tsx 在 pointermove 检测到真实位移后调
/// invoke("orb_begin_native_drag")）。
///
/// 用系统原生拖动（Window::start_dragging → macOS performWindowDragWithEvent）替代
/// 前端每帧 setPosition：窗口移动由窗口服务器合成，不触发 WebView 重绘与 vibrancy
/// 重算，消除 transparent 窗口拖动残影/卡顿。
///
/// 为什么发起时机从前端 pointerdown 改到 pointermove（超阈值后才调）：
/// 上一版在 pointerdown 就 invoke，把「点击/拖动」判定完全押在 Rust 侧读
/// outer_position 上——透明 + always_on_top 窗口上该读数不可靠，位移读成 0 就把
/// 拖动判成点击 → 误呼出主窗（用户实测复现）。现在前端只在「已经真的移动了
/// DRAG_START_THRESHOLD 以上」时才发起原生拖动：
///   - 点击（无位移）→ 根本不调本命令，前端 pointerup 直接呼出主窗（判定不依赖
///     Rust，100% 稳定）；
///   - 拖动（有位移）→ 交系统原生拖动，松手后由 Rust emit 拖动结束事件 → 前端吸附。
/// 原生拖动会吞掉 mouseup（tauri issue #10767：webview 收不到 mouse-up），故拖动
/// 的收尾（角落吸附）落在 Rust 侧 drag_window 返回之后。
///
/// 关键机理（tauri-runtime-wry send_user_message）：本命令跑在 async_runtime 线程（非主线程），
/// run_on_main_thread 只是把一个 Message::Task 经 proxy 入队；主循环出队后在主线程执行闭包——
/// 此时 orb.start_dragging() → send_user_message(DragWindow) 命中「已在主线程」分支，同步执行
/// window.drag_window()（macOS performWindowDragWithEvent）并阻塞至松手才返回，返回后立即取 cur
/// 判定，与 start_dragging 之间没有第二条待处理消息。
///
/// 为何弃用「start_dragging 一次 + finish Task 一次」两次入队依赖 FIFO：start_dragging() 在命令
/// 线程调用只把 DragWindow 经 proxy 入队（不阻塞），随后入队的 finish Task 会被
/// performWindowDragWithEvent 的嵌套 modal 循环在拖动结束前消费，读到位移≈0 的 cur，误判
/// clicked=true → 误呼出主窗（而非吸附）。单次 Task 内同步 start_dragging + 紧跟 finish 无此竞态。
#[tauri::command]
pub fn orb_begin_native_drag(app: tauri::AppHandle) {
    let Some(orb) = app.get_webview_window("floating_orb") else {
        return;
    };
    // 拖动前位置（物理像素）；拿不到就当「会移动」，交前端按拖动吸附处理。
    let pre = orb.outer_position().ok();
    // 清空上一轮 Moved 计数：本次拖动的位移证据从 0 开始累加。
    ORB_DRAG_MOVE_COUNT.store(0, Ordering::SeqCst);
    let app_for_finish = app.clone();
    // 整个流程入队为一次主线程 Task：闭包在主线程执行，start_dragging() 同步阻塞至松手，
    // 返回后立即取 cur 判定（见上方机理说明）。
    let _ = app.run_on_main_thread(move || {
        if let Err(e) = orb.start_dragging() {
            // 原生拖动没起来：不发拖动结束事件，让前端 pointerup 自己收尾
            // （它只知道「位移过」→ 就地吸附，绝不会误呼出主窗）。
            crate::logger::error("orb", &format!("native drag start failed: {e}"));
            return;
        }
        orb_finish_native_drag(&app_for_finish, pre);
    });
}

/// 原生拖动结束（鼠标松开）后的裁决，在主线程、drag_window 返回之后执行。
///
/// 双证据判定「拖动 vs 点击」：Moved 事件计数 > 0 **或** 位置位移 ≥ 阈值 → 拖动。
/// 只用位置位移不可靠（透明 + always_on_top 窗口 outer_position 曾读成与拖动前一致），
/// 只用 Moved 计数则在个别系统版本嵌套循环不投递 Moved 时会漏判，二者取或最稳。
/// 结果同时落日志（pre/cur/delta/moved_events），便于用户实测后回填根因。
fn orb_finish_native_drag<R: Runtime>(
    app: &AppHandle<R>,
    pre: Option<tauri::PhysicalPosition<i32>>,
) {
    let Some(orb) = app.get_webview_window("floating_orb") else {
        return;
    };
    let moved_events = ORB_DRAG_MOVE_COUNT.load(Ordering::SeqCst);
    let scale = orb.scale_factor().ok().filter(|s| *s > 0.0).unwrap_or(1.0);
    let dragged = match (pre, orb.outer_position()) {
        (Some(p), Ok(cur)) => {
            let dx = (cur.x - p.x) as f64 / scale;
            let dy = (cur.y - p.y) as f64 / scale;
            let delta = (dx * dx + dy * dy).sqrt();
            let dragged = moved_events > 0 || delta >= ORB_CLICK_THRESHOLD;
            crate::logger::info(
                "orb",
                &format!(
                    "native drag end: dragged={dragged} delta={delta:.1}px moved_events={moved_events} pre=({},{}) cur=({},{}) scale={scale}",
                    p.x, p.y, cur.x, cur.y
                ),
            );
            dragged
        }
        _ => {
            // 位置读不到：按拖动处理（前端只在检测到位移后才发起原生拖动）。
            crate::logger::info(
                "orb",
                &format!("native drag end: dragged=true (position unreadable) moved_events={moved_events}"),
            );
            true
        }
    };
    let _ = app.emit_to(
        EventTarget::webview_window("floating_orb"),
        ORB_DRAG_END_EVENT,
        serde_json::json!({ "dragged": dragged }),
    );
}

/// 模块 1（1.6）：读取拖放文件元信息（由浮球经主窗口转调；主窗口持 fs 权限）。
/// 返回 [{ path, name, size }]，用于主窗口 multipart upload（完整链路归模块 2.4）。
#[tauri::command]
pub fn read_dropped_files(paths: Vec<String>) -> Vec<DroppedFile> {
    paths
        .into_iter()
        .filter_map(|path| {
            let meta = fs::metadata(&path).ok()?;
            if !meta.is_file() {
                return None;
            }
            let name = path.rsplit('/').next().unwrap_or("file").to_string();
            Some(DroppedFile {
                path,
                name,
                size: meta.len(),
            })
        })
        .collect()
}

#[derive(Serialize)]
pub struct DroppedFile {
    pub path: String,
    pub name: String,
    pub size: u64,
}
