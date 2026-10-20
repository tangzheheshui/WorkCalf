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

/// 鼠标穿透 = 用户开关 || 光标悬停在透明像素上（前端命中测试）
pub fn apply_cursor_mode(app: &AppHandle) {
    let st = app.state::<AppState>();
    let user = *st.force_ignore_cursor.lock().unwrap();
    let hot = *st.hot_ignore.lock().unwrap();
    if let Some(w) = main_window(app) {
        let _ = w.set_ignore_cursor_events(user || hot);
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

    let path = st.cfg_path.clone();
    cfg.save(&path).map_err(|e| e.to_string())?;
    *st.cfg.lock().unwrap() = cfg.clone();
    *st.force_ignore_cursor.lock().unwrap() = cfg.click_through;
    drop(st);

    apply_window_geometry(&app);
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
pub fn open_settings(app: AppHandle) {
    open_settings_internal(&app);
}

pub fn open_settings_internal(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            app,
            "settings",
            tauri::WebviewUrl::App("settings.html".into()),
        )
        .title("闲牛 · 设置")
        .inner_size(420.0, 520.0)
        .resizable(false)
        .center()
        .build();
    }
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

/// 前端命中测试结果：光标位于非透明像素上（仅用户未开穿透时生效）
#[tauri::command]
pub fn set_shaped_ignore(app: AppHandle, hot: bool) {
    let st = app.state::<AppState>();
    {
        let mut h = st.hot_ignore.lock().unwrap();
        if *h == hot {
            return;
        }
        *h = hot;
    }
    drop(st);
    apply_cursor_mode(&app);
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
    let tmp = std::env::temp_dir();
    let line = format!("[{}] {}\n", chrono_free_ts(), msg);
    use std::io::Write as _;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(tmp.join("workcalf_debug.txt"))
    {
        let _ = f.write_all(line.as_bytes());
    }
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
