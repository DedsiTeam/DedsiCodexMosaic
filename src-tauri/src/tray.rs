use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus())
        {
            eprintln!("无法恢复主窗口：{error}");
        }
    }
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let icon = app.default_window_icon().cloned().ok_or("缺少系统托盘图标")?;
    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip(format!("DedsiCodexMosaic v{}", app.package_info().version))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
