//! Tauri IPC 命令层 + 窗口/配置应用逻辑（跨平台共享）

use std::sync::atomic::{AtomicBool, Ordering};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow, Wry};

/// 设置页脚本跑完后会调用 `settings_ready`；用于白屏看门狗判断页面是否真的加载了。
static SETTINGS_READY: AtomicBool = AtomicBool::new(false);

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
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

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
        cfg.scale = v.clamp(0.3, 2.0);
    }
    if let Some(v) = patch.get("opacity").and_then(Value::as_f64) {
        cfg.opacity = v.clamp(0.2, 1.0);
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
    if let Some(v) = patch.get("usage_count").and_then(Value::as_u64) {
        cfg.usage_count = v;
    }
    if let Some(v) = patch.get("rest_reminder").and_then(Value::as_bool) {
        cfg.rest_reminder = v;
    }
    if let Some(v) = patch.get("rest_interval").and_then(Value::as_u64) {
        cfg.rest_interval = v.clamp(100, 10_000);
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

/// 休息提醒：让桌宠窗口左右轻戳几下再回原位。
/// 只动自己的小窗口，不抢焦点、不碰用户的其他窗口。
static NUDGING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn nudge_window(app: AppHandle) {
    if NUDGING.swap(true, Ordering::SeqCst) {
        return;
    }
    let Some(win) = main_window(&app) else {
        NUDGING.store(false, Ordering::SeqCst);
        return;
    };
    std::thread::spawn(move || {
        if let Ok(base) = win.outer_position() {
            for i in 0..6 {
                let dx = if i % 2 == 0 { 5 } else { -5 };
                let _ = win.set_position(tauri::PhysicalPosition::new(base.x + dx, base.y));
                std::thread::sleep(std::time::Duration::from_millis(45));
            }
            let _ = win.set_position(base);
        }
        NUDGING.store(false, Ordering::SeqCst);
    });
}

/// 键鼠计数：前端每几秒把增量刷进来，这里只累加并落盘。
/// 不走 set_config（那边会重建窗口/广播配置），避免高频调用带来的抖动。
#[tauri::command]
pub fn add_usage(app: AppHandle, delta: u64) -> Result<u64, String> {
    let st = app.state::<AppState>();
    let path = st.cfg_path.clone();
    let mut cfg = st.cfg.lock().unwrap();
    cfg.usage_count = cfg.usage_count.saturating_add(delta);
    let total = cfg.usage_count;
    cfg.save(&path).map_err(|e| e.to_string())?;
    Ok(total)
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

/// 注意：必须是 async 命令。同步命令会在 WebView2 的 IPC 回调里直接执行，
/// 在其中新建 webview 属于重入，部分机器/WebView2 版本会卡住整条 UI 线程
/// （表现就是设置窗口一片白、点关闭也没反应）。async 命令改到工作线程执行，
/// 由主线程事件循环完成窗口创建。
#[tauri::command]
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    open_settings_internal(&app).map_err(|e| {
        let msg = format!("打开设置面板失败: {e}");
        write_log(&msg);
        msg
    })
}

/// 托盘/二次启动等主线程回调里用它：把窗口创建丢到后台线程，
/// 主线程只负责事件循环，避免重入创建 webview 卡死界面。
pub fn open_settings_async(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = open_settings_internal(&app) {
            write_log(&format!("open_settings: failed: {e}"));
        }
    });
}

/// 设置页加载完成后由前端调用，喂给白屏看门狗。
#[tauri::command]
pub fn settings_ready() {
    SETTINGS_READY.store(true, Ordering::SeqCst);
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
    SETTINGS_READY.store(false, Ordering::SeqCst);
    let built = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("勤劳的牛牛 · 设置")
    .inner_size(620.0, 460.0)
    .min_inner_size(620.0, 460.0)
    .resizable(false)
    // 设置面板不单独占任务栏按钮，避免任务栏多出一个图标
    .skip_taskbar(true)
    .center()
    // WebView2 要求同一数据目录下所有窗口的浏览器参数一致，否则创建失败。
    // 这里的字符串必须和 tauri.conf.json 主窗口的 additionalBrowserArgs 完全一致。
    .additional_browser_args(crate::WEBVIEW_BROWSER_ARGS)
    .focused(true)
    .on_page_load(|_w, payload| {
        write_log(&format!("settings: page load event, url={}", payload.url()));
    })
    .build();
    match &built {
        Ok(_) => write_log("open_settings: window created"),
        Err(e) => write_log(&format!("open_settings: create failed: {e}")),
    }
    if let Ok(w) = &built {
        // 白屏看门狗：页面正常加载时 settings.js 会调用 settings_ready。
        // 8 秒还没就绪 → 重新加载一次；再 8 秒仍没就绪 → 销毁窗口，
        // 让用户再点一次就能重新创建，而不是留一个关不掉的白色窗口。
        let w = w.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(8));
            if SETTINGS_READY.load(Ordering::SeqCst) {
                return;
            }
            write_log("settings watchdog: page not ready after 8s, reloading");
            let _ = w.eval("location.reload()");
            std::thread::sleep(std::time::Duration::from_secs(8));
            if SETTINGS_READY.load(Ordering::SeqCst) {
                return;
            }
            write_log("settings watchdog: still not ready, destroying window");
            let _ = w.destroy();
        });
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

/// 用系统默认浏览器打开 http/https 链接（设置面板「去下载」用）。
/// 只放行 http/https，避免被前端当成任意命令执行。
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("只支持 http/https 链接".into());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }

    Ok(())
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
                json!({ "rx": 0.65, "ry": -0.3, "inside": false, "dx": 300.0, "dy": -160.0 }),
            );
            let keys = [
                "KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Space", "Num1",
                "Delete", "Backspace", "Return",
            ];
            for i in 0..55 {
                crate::state_machine::force_busy();
                let _ = app.emit_to(
                    "main",
                    "pet://key",
                    json!({ "key": keys[i % keys.len()] }),
                );
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
