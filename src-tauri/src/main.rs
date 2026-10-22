#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! 勤劳的牛牛 WorkCalf —— 佛系打工小牛桌面桌宠
//! 纯单机：无登录、无账号；仅在用户主动提交反馈或检查更新时访问服务端。

mod commands;
mod config;
mod input;
mod state_machine;
mod tray;

use std::sync::Mutex;
use tauri::Manager;

/// 所有 WebView2 窗口必须用完全一致的浏览器参数（同一用户数据目录只能有一个环境），
/// 必须与 tauri.conf.json 里主窗口的 additionalBrowserArgs 逐字一致。
pub const WEBVIEW_BROWSER_ARGS: &str =
    "--autoplay-policy=no-user-gesture-required --disable-features=CalculateNativeWinOcclusion";

pub struct AppState {
    /// 当前配置（内存副本）
    pub cfg: Mutex<config::AppConfig>,
    /// 配置文件路径
    pub cfg_path: std::path::PathBuf,
    /// 用户设置的鼠标穿透（设置面板开关）
    pub force_ignore_cursor: Mutex<bool>,
}

/// 启动守卫：在 Tauri 创建任何窗口/托盘图标之前，先抢一个进程级命名互斥体。
/// 即使同时双击、或旧副本（如 workcalf(1).exe）还在运行，也只有一个进程能继续，
/// 其余的立刻静默退出，任务栏/托盘不会闪出多个图标。
///
/// 重复启动时不再只是退出，而是通过命名事件通知已运行的实例打开设置面板，
/// 这样“双击图标”在程序已经运行时也会直接跳到设置页。
#[cfg(windows)]
struct StartupGuard {
    /// 自动复位事件：重复启动的进程 SetEvent，主实例的等待线程被唤醒
    open_settings_event: windows_sys::Win32::Foundation::HANDLE,
}


#[cfg(windows)]
fn acquire_startup_guard() -> Option<StartupGuard> {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::{
        CreateEventW, CreateMutexW, OpenEventW, SetEvent, EVENT_MODIFY_STATE,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    let mutex_name = wide("Local\\com.workcalf.app.startup-guard");
    let event_name = wide("Local\\com.workcalf.app.open-settings");

    unsafe {
        let mutex = CreateMutexW(std::ptr::null(), 1, mutex_name.as_ptr());
        if mutex.is_null() {
            // 互斥体都建不出来（极少见）：不拦，交给单实例插件兜底
            let ev = CreateEventW(std::ptr::null(), 0, 0, event_name.as_ptr());
            return Some(StartupGuard { open_settings_event: ev });
        }
        if GetLastError() == ERROR_ALREADY_EXISTS {
            // 已有实例在跑：请它打开设置面板，然后静默退出
            let ev = OpenEventW(EVENT_MODIFY_STATE, 0, event_name.as_ptr());
            if !ev.is_null() {
                SetEvent(ev);
                CloseHandle(ev);
            }
            CloseHandle(mutex);
            return None;
        }
        // 主实例：互斥体句柄故意不关，持有到进程结束，由系统释放。
        // 事件用自动复位，每次重复启动只唤醒一次。
        let ev = CreateEventW(std::ptr::null(), 0, 0, event_name.as_ptr());
        Some(StartupGuard { open_settings_event: ev })
    }
}

fn main() {
    // 重复启动：通知主实例打开设置后退出；主实例拿到事件句柄继续启动
    #[cfg(windows)]
    let open_settings_event = match acquire_startup_guard() {
        Some(g) => g.open_settings_event as usize,
        None => return,
    };

    let (cfg, cfg_path) = config::AppConfig::load_or_create();
    let click_through = cfg.click_through;

    tauri::Builder::default()
        // 单实例：二次启动时聚焦已有窗口
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .manage(AppState {
            cfg: Mutex::new(cfg),
            cfg_path,
            force_ignore_cursor: Mutex::new(click_through),
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::get_config,
            commands::set_config,
            commands::toggle_sound,
            commands::open_settings,
            commands::reset_position,
            commands::quit_app,
            commands::mac_permission_status,
            commands::open_mac_accessibility,
            commands::open_url,
            commands::settings_ready,
            commands::debug_dump,
            commands::debug_log,
        ])
        .setup(move |app| {
            // 记录运行环境，便于排查白屏等机器相关问题
            commands::write_log(&format!(
                "startup: webview2={:?}",
                tauri::webview_version()
            ));
            // 等待“重复启动”信号：双击 exe / 快捷方式 → 打开设置面板
            #[cfg(windows)]
            if open_settings_event != 0 {
                use windows_sys::Win32::Foundation::WAIT_OBJECT_0;
                use windows_sys::Win32::System::Threading::WaitForSingleObject;

                let app_handle = app.handle().clone();
                // setup 闭包要求 Send，因此句柄以 usize 形式捕获
                let event_addr = open_settings_event;
                std::thread::spawn(move || loop {
                    let event = event_addr as windows_sys::Win32::Foundation::HANDLE;
                    let r = unsafe { WaitForSingleObject(event, u32::MAX) };
                    if r != WAIT_OBJECT_0 {
                        break;
                    }
                    // 窗口创建放到后台线程，主线程只跑事件循环
                    commands::open_settings_async(&app_handle);
                });
            }

            let handle = app.handle().clone();
            state_machine::init(handle.clone());
            input::spawn(handle.clone());
            commands::apply_window_geometry(&handle);
            commands::apply_cursor_mode(&handle);
            tray::create(handle.clone())?;
            // 模拟输入脉冲只在显式设置 WORKCALF_SIM_INPUT=1 时启用；
            // 不能跟着 debug_dump 一起开，否则正常使用时会自己"劈里啪啦"打字。
            {
                let st = handle.state::<AppState>();
                let sim = std::env::var("WORKCALF_SIM_INPUT").ok().as_deref() == Some("1");
                if st.cfg.lock().unwrap().debug_dump && sim {
                    commands::start_debug_simulator(&handle);
                }
            }
            // 测试钩子：WORKCALF_AUTO_SETTINGS=1 时启动 4s 后自动打开设置面板
            if std::env::var("WORKCALF_AUTO_SETTINGS").ok().as_deref() == Some("1") {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(4));
                    let _ = commands::open_settings_internal(&h);
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("勤劳的牛牛启动失败");
}
