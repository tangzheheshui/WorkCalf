//! Tauri IPC 命令层 + 窗口/配置应用逻辑（跨平台共享）

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow, Wry};

use crate::config::AppConfig;
use crate::{input, AppState};

/// 主窗口基准尺寸（逻辑像素），缩放通过改变窗口大小实现
pub const BASE_SIZE: f64 = 340.0;

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

// ---------- 窗口几何 ----------

/// 启动时：应用尺寸并按配置定位（保存的位置，或默认右下角）
pub fn apply_window_geometry(app: &AppHandle) {
    let st = app.state::<AppState>();
    let cfg = st.cfg.lock().unwrap().clone();
    if let Some(w) = main_window(app) {
        let s = BASE_SIZE * cfg.scale;
        let _ = w.set_size(LogicalSize::new(s, s));
        if cfg.pos_x >= 0 && cfg.pos_y >= 0 {
            let _ = w.set_position(LogicalPosition::new(f64::from(cfg.pos_x), f64::from(cfg.pos_y)));
        } else {
            place_bottom_right(&w, cfg.scale);
        }
    }
}

/// 运行中改缩放：只改尺寸，保持窗口当前位置不动。
/// 不能复用 apply_window_geometry——那里会用配置里的旧坐标覆盖当前拖拽位置。
pub fn apply_window_size(app: &AppHandle) {
    let st = app.state::<AppState>();
    let scale = st.cfg.lock().unwrap().scale;
    if let Some(w) = main_window(app) {
        let s = BASE_SIZE * scale;
        let _ = w.set_size(LogicalSize::new(s, s));
    }
}

fn place_bottom_right(w: &WebviewWindow, scale: f64) {
    let Ok(Some(monitor)) = w.current_monitor() else {
        return;
    };
    let sf = monitor.scale_factor();
    let mon = monitor.size().to_logical::<f64>(sf);
    let win = BASE_SIZE * scale;
    let x = (mon.width - win - 24.0).max(0.0);
    let y = (mon.height - win - 24.0).max(0.0);
    let _ = w.set_position(LogicalPosition::new(x, y));
}

/// 鼠标穿透 = 用户开关。未开启时整个窗口矩形都可交互（拖拽/右键）。
pub fn apply_cursor_mode(app: &AppHandle) {
    let st = app.state::<AppState>();
    let user = *st.force_ignore_cursor.lock().unwrap();
    if let Some(w) = main_window(app) {
        let _ = w.set_ignore_cursor_events(user);
    }
}

/// 拖拽后周期保存窗口位置
pub fn save_position_if_moved(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    let (Ok(pos), Ok(sf)) = (w.outer_position(), w.scale_factor()) else {
        return;
    };
    let l = pos.to_logical::<f64>(sf);
    let x = l.x.round() as i32;
    let y = l.y.round() as i32;
    let st = app.state::<AppState>();
    let path = st.cfg_path.clone();
    let mut cfg = st.cfg.lock().unwrap();
    if cfg.pos_x != x || cfg.pos_y != y {
        cfg.pos_x = x;
        cfg.pos_y = y;
        let snapshot = cfg.clone();
        drop(cfg);
        let _ = snapshot.save(&path);
    }
}

// ---------- IPC 命令 ----------

#[tauri::command]
pub fn get_config(app: AppHandle) -> AppConfig {
    app.state::<AppState>().cfg.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_config(app: AppHandle, patch: Value) -> Result<AppConfig, String> {
    let st = app.state::<AppState>();
    let mut cfg = st.cfg.lock().unwrap().clone();

    // 校验并合并
    if let Some(v) = patch.get("idle_timeout_secs").and_then(Value::as_u64) {
        if [3, 4, 5, 8].contains(&v) {
            cfg.idle_timeout_secs = v as u32;
        }
    }
    if let Some(v) = patch.get("anim_speed").and_then(Value::as_str) {
        if ["slow", "normal", "fast"].contains(&v) {
            cfg.anim_speed = v.into();
        }
    }
    if let Some(v) = patch.get("scale").and_then(Value::as_f64) {
        cfg.scale = v.clamp(0.5, 2.0);
    }
    if let Some(v) = patch.get("click_through").and_then(Value::as_bool) {
        cfg.click_through = v;
    }
    if let Some(v) = patch.get("sound_enabled").and_then(Value::as_bool) {
        cfg.sound_enabled = v;
    }
    if let Some(v) = patch.get("model_id").and_then(Value::as_str) {
        let ok = !v.is_empty()
            && v.len() <= 32
            && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        if ok {
            cfg.model_id = v.to_string();
        }
    }

    let path = st.cfg_path.clone();
    cfg.save(&path).map_err(|e| e.to_string())?;
    *st.cfg.lock().unwrap() = cfg.clone();
    *st.force_ignore_cursor.lock().unwrap() = cfg.click_through;
    drop(st);

    apply_window_size(&app);
    apply_cursor_mode(&app);
    let payload = serde_json::to_value(&cfg).unwrap();
    let _ = app.emit_to("main", "pet://config", payload.clone());
    let _ = app.emit_to("settings", "pet://config", payload);
    Ok(cfg)
}

#[tauri::command]
pub fn toggle_sound(app: AppHandle) -> Result<AppConfig, String> {
    let cur = app
        .state::<AppState>()
        .cfg
        .lock()
        .unwrap()
        .sound_enabled;
    set_config(app, json!({ "sound_enabled": !cur }))
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    open_settings_internal(&app).map_err(|e| {
        let msg = format!("打开设置面板失败: {e}");
        write_log(&msg);
        msg
    })
}

pub fn open_settings_internal(app: &AppHandle) -> tauri::Result<()> {
    write_log("open_settings: begin");
    if let Some(w) = app.get_webview_window("settings") {
        w.show()?;
        w.unminimize()?;
        w.set_focus()?;
        write_log("open_settings: reused existing window");
        return Ok(());
    }
    let built = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("勤劳的牛牛 · 设置")
    .inner_size(440.0, 620.0)
    .min_inner_size(440.0, 620.0)
    .resizable(false)
    .center()
    // WebView2 要求同一数据目录下所有窗口的浏览器参数一致，否则创建失败
    .additional_browser_args("--autoplay-policy=no-user-gesture-required")
    .focused(true)
    .build();
    match &built {
        Ok(_) => write_log("open_settings: window created"),
        Err(e) => write_log(&format!("open_settings: create failed: {e}")),
    }
    built.map(|_| ())
}

#[tauri::command]
pub fn reset_position(app: AppHandle) {
    reset_position_internal(&app);
}

pub fn reset_position_internal(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let scale = app.state::<AppState>().cfg.lock().unwrap().scale;
        place_bottom_right(&w, scale);
        save_position_if_moved(app);
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    save_position_if_moved(&app);
    app.exit(0);
}

#[tauri::command]
pub fn mac_permission_status() -> bool {
    // Windows 恒 true；macOS 返回全局监听器是否正常
    input::listener_ok()
}

#[tauri::command]
pub fn open_mac_accessibility() {
    // 跳转：系统设置 → 隐私与安全性 → 辅助功能
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }
}

/// 调试：导出前端 canvas 当前帧 + 状态机快照（config.debug_dump=true 时由前端定期调用）
#[tauri::command]
pub fn debug_dump(data_url: String) -> Result<String, String> {
    use base64::Engine as _;
    let b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("bad data url")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    let tmp = std::env::temp_dir();
    std::fs::write(tmp.join("workcalf_canvas.png"), &bytes).map_err(|e| e.to_string())?;
    let snap = format!(
        "{}\n{}",
        crate::state_machine::debug_snapshot(),
        chrono_free_ts()
    );
    std::fs::write(tmp.join("workcalf_debug.txt"), snap).map_err(|e| e.to_string())?;
    Ok(tmp.join("workcalf_canvas.png").to_string_lossy().into_owned())
}

/// 调试：前端日志落盘（定位无显示环境下 webview 内的报错）
#[tauri::command]
pub fn debug_log(msg: String) {
    write_log(&msg);
}

pub fn write_log(msg: &str) {
    let tmp = std::env::temp_dir();
    let line = format!("[{}] {}\n", chrono_free_ts(), msg);
    use std::io::Write as _;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(tmp.join("workcalf_debug.log"))
    {
        let _ = f.write_all(line.as_bytes());
    }
}

/// 调试（仅 config.debug_dump=true 时启用）：模拟输入脉冲。
/// 走与真实输入完全相同的事件管线（force_busy + pet://key），
/// 用于无输入环境验证忙碌态动画与打断逻辑。
pub fn start_debug_simulator(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));
        loop {
            // 一轮 55 次"按键"@70ms ≈ 3.9s（强度可到流汗阈值之上）
            let _ = app.emit_to(
                "main",
                "pet://mouse",
                json!({ "rx": 0.65, "ry": -0.3, "inside": false }),
            );
            for _ in 0..55 {
                crate::state_machine::force_busy();
                let _ = app.emit_to("main", "pet://key", json!({}));
                std::thread::sleep(std::time::Duration::from_millis(70));
            }
            std::thread::sleep(std::time::Duration::from_secs(24));
        }
    });
}

fn chrono_free_ts() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

#[allow(unused)]
fn _type_check(_w: &WebviewWindow<Wry>) {}
