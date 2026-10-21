#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! 闲牛 WorkCalf —— 佛系打工小牛桌面桌宠
//! 纯单机：无网络请求、无登录、无更新检测。

mod commands;
mod config;
mod input;
mod state_machine;
mod tray;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    /// 当前配置（内存副本）
    pub cfg: Mutex<config::AppConfig>,
    /// 配置文件路径
    pub cfg_path: std::path::PathBuf,
    /// 用户设置的鼠标穿透（设置面板开关）
    pub force_ignore_cursor: Mutex<bool>,
    /// 前端逐像素命中测试得到的动态穿透（光标在透明区域上）
    pub hot_ignore: Mutex<bool>,
}

fn main() {
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
            hot_ignore: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_config,
            commands::toggle_sound,
            commands::open_settings,
            commands::reset_position,
            commands::set_shaped_ignore,
            commands::quit_app,
            commands::mac_permission_status,
            commands::open_mac_accessibility,
            commands::debug_dump,
            commands::debug_log,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            state_machine::init(handle.clone());
            input::spawn(handle.clone());
            commands::apply_window_geometry(&handle);
            commands::apply_cursor_mode(&handle);
            tray::create(handle.clone())?;
            {
                let st = handle.state::<AppState>();
                if st.cfg.lock().unwrap().debug_dump {
                    commands::start_debug_simulator(&handle);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("闲牛启动失败");
}
