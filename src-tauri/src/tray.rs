//! 系统托盘：兜底入口。
//! 鼠标穿透开启时右键菜单不可达，必须保留托盘才能关回穿透。

use tauri::menu::{IsMenuItem, MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Wry};

use crate::commands;

pub fn create(app: AppHandle) -> tauri::Result<()> {
    // 暂时只保留两个入口，其余配置项都在设置面板里
    let open_settings = MenuItemBuilder::with_id("open_settings", "设置面板").build(&app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出程序").build(&app)?;

    let items: Vec<&dyn IsMenuItem<Wry>> = vec![&open_settings, &quit];
    let menu = MenuBuilder::new(&app).items(&items).build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("勤劳的牛牛")
        .menu(&menu)
        // 左键/右键都弹菜单，兼容不同用户习惯
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()));

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(&app)?;
    Ok(())
}

pub fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "open_settings" => {
            let _ = commands::open_settings_internal(app);
        }
        "quit" => {
            commands::save_position_if_moved(app);
            app.exit(0);
        }
        _ => {}
    }
}
