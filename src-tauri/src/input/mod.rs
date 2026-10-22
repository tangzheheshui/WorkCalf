//! 全局输入监听：接口抽象 + 平台适配（Windows 全局钩子 / macOS CGEventTap）
//! 上层（状态机、前端动画）完全不区分平台。

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::state_machine;

#[derive(Debug, Clone)]
pub enum InputEvent {
    /// 键名（rdev 的 Debug 名，如 "KeyA" / "Num1" / "Space"），前端映射到键盘位置
    KeyPress(String),
    MouseMove(f64, f64),
    LeftClick,
}

static LISTENER_OK: AtomicBool = AtomicBool::new(true);

/// macOS 辅助功能权限等异常时置 false，供设置面板查询
pub fn report_listener_error(msg: String) {
    LISTENER_OK.store(false, Ordering::Relaxed);
    if let Some(app) = crate::state_machine::APP.get() {
        let _ = app.emit_to("main", "pet://listener-error", json!({ "message": msg }));
        let _ = app.emit_to("settings", "pet://listener-error", json!({ "message": msg }));
    }
}

pub fn listener_ok() -> bool {
    LISTENER_OK.load(Ordering::Relaxed)
}

/// 启动平台监听线程 + 事件转发线程（限频、坐标换算、状态机联动）
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<InputEvent>();
        #[cfg(target_os = "windows")]
        std::thread::spawn(move || windows::WindowsInputListener::start(tx));
        #[cfg(target_os = "macos")]
        std::thread::spawn(move || macos::MacInputListener::start(tx));

        crate::commands::write_log("input: listener thread spawned");
        forward_loop(app, rx);
    });
}

fn forward_loop(app: AppHandle, rx: Receiver<InputEvent>) {
    let mut last_mouse_fwd = Instant::now() - Duration::from_secs(1);
    let mut last_mouse_pos: Option<(f64, f64)> = None;
    for ev in rx {
        state_machine::touch_input();
        match ev {
            InputEvent::KeyPress(key) => {
                state_machine::force_busy();
                let _ = app.emit_to("main", "pet://key", json!({ "key": key }));
            }
            InputEvent::LeftClick => {
                state_machine::force_busy();
                let _ = app.emit_to("main", "pet://click", json!({ "button": "left" }));
            }
            InputEvent::MouseMove(x, y) => {
                // 鼠标移动限频 ~30Hz，避免高频刷爆 IPC
                if last_mouse_fwd.elapsed() < Duration::from_millis(33) {
                    continue;
                }
                last_mouse_fwd = Instant::now();
                // 两次上报之间的真实位移：前端按“相对鼠标垫的位移”累积，
                // 而不是把屏幕绝对坐标缩放成垫子位置（后者光标一远离窗口就不动了）
                let (dx, dy) = last_mouse_pos
                    .map(|(lx, ly)| (x - lx, y - ly))
                    .unwrap_or((0.0, 0.0));
                last_mouse_pos = Some((x, y));
                if let Some((rx, ry, inside)) = compute_rel(&app, x, y) {
                    let _ = app.emit_to(
                        "main",
                        "pet://mouse",
                        json!({ "rx": rx, "ry": ry, "inside": inside, "dx": dx, "dy": dy }),
                    );
                }
            }
        }
    }
}

/// 屏幕坐标 → 相对窗口中心归一化 (-1..1)，并判断光标是否在窗口矩形内
/// rdev 坐标系：Windows = 物理像素；macOS = 逻辑点
fn compute_rel(app: &AppHandle, x: f64, y: f64) -> Option<(f64, f64, bool)> {
    let win = app.get_webview_window("main")?;
    let scale = win.scale_factor().ok()?;
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;

    let (cx, cy, w, h) = if cfg!(target_os = "macos") {
        (
            pos.x as f64 / scale,
            pos.y as f64 / scale,
            size.width as f64 / scale,
            size.height as f64 / scale,
        )
    } else {
        (
            pos.x as f64,
            pos.y as f64,
            size.width as f64,
            size.height as f64,
        )
    };

    let inside = x >= cx && y >= cy && x <= cx + w && y <= cy + h;
    let rx = ((x - (cx + w / 2.0)) / (w / 2.0)).clamp(-1.5, 1.5);
    let ry = ((y - (cy + h / 2.0)) / (h / 2.0)).clamp(-1.5, 1.5);
    Some((rx, ry, inside))
}
