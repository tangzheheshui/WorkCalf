//! 系统托盘：兜底入口。
//! 鼠标穿透开启时右键菜单不可达，必须保留托盘才能关回穿透。

use tauri::menu::{IsMenuItem, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Wry};

use crate::commands;

pub fn create(app: AppHandle) -> tauri::Result<()> {
    let toggle_sound = MenuItemBuilder::with_id("toggle_sound", "开启/关闭音效").build(&app)?;
    let open_settings = MenuItemBuilder::with_id("open_settings", "设置面板").build(&app)?;
    let reset_pos = MenuItemBuilder::with_id("reset_pos", "重置位置").build(&app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出程序").build(&app)?;
    let sep1 = PredefinedMenuItem::separator(&app)?;
    let sep2 = PredefinedMenuItem::separator(&app)?;
    let sep3 = PredefinedMenuItem::separator(&app)?;

    let items: Vec<&dyn IsMenuItem<Wry>> = vec![
        &toggle_sound,
        &sep1,
        &open_settings,
        &sep2,
        &reset_pos,
        &sep3,
        &quit,
    ];
    let menu = MenuBuilder::new(&app).items(&items).build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("闲牛")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()));

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(&app)?;
    Ok(())
}

pub fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "toggle_sound" => {
            let _ = commands::toggle_sound(app.clone());
        }
        "open_settings" => commands::open_settings_internal(app),
        "reset_pos" => commands::reset_position_internal(app),
        "quit" => {
            commands::save_position_if_moved(app);
            app.exit(0);
        }
        _ => {}
    }
}
