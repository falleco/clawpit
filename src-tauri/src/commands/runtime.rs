use crate::commands::instance::{start_instance, stop_instance};
use crate::commands::AppState;
use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// Embed the tray icon at compile time
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../../icons/tray.png");

pub const TRAY_ICON_ID: &str = "clawpit-tray";
pub const TRAY_TOGGLE_WINDOW_MENU_ID: &str = "tray-toggle-window";
pub const TRAY_START_GATEWAY_MENU_ID: &str = "tray-start-gateway";
pub const TRAY_STOP_GATEWAY_MENU_ID: &str = "tray-stop-gateway";
pub const TRAY_OPEN_WEB_MENU_ID: &str = "tray-open-web";
pub const TRAY_QUIT_MENU_ID: &str = "tray-quit";
pub const APP_SETTINGS_MENU_ID: &str = "app-settings";
pub const APP_QUIT_MENU_ID: &str = "app-quit";
pub const SETTINGS_WINDOW_LABEL: &str = "settings-window";

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrayStatus {
    Running,
    Transitioning,
    Error,
    NotConfigured,
}

impl TrayStatus {
    fn label(self) -> &'static str {
        match self {
            Self::Running => "Running and healthy",
            Self::Transitioning => "Starting or stopping",
            Self::Error => "Error or stopped",
            Self::NotConfigured => "Not configured",
        }
    }
}

pub fn init_system_tray(app: &AppHandle) -> Result<(), String> {
    if app.tray_by_id(TRAY_ICON_ID).is_some() {
        return Ok(());
    }

    let menu = build_tray_menu(app, TrayStatus::NotConfigured, None)?;
    let icon = build_tray_icon();

    let builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .icon(icon)
        .tooltip("Clawpit - Not configured")
        .menu(&menu)
        .show_menu_on_left_click(false);

    // On macOS, we don't set icon_as_template because we want to show colored status icons
    // Template icons are monochrome and get tinted by the system, which would hide our status colors
    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(false);

    builder
        .build(app)
        .map_err(|e| format!("Failed to create tray icon: {}", e))?;

    Ok(())
}

pub fn init_system_menu(app: &AppHandle) -> Result<(), String> {
    // App submenu (Clawpit)
    let settings_item = MenuItem::with_id(
        app,
        APP_SETTINGS_MENU_ID,
        "Settings",
        true,
        Some("CmdOrCtrl+,"),
    )
    .map_err(|e| format!("Failed to build system menu settings item: {}", e))?;

    let quit_item = MenuItem::with_id(app, APP_QUIT_MENU_ID, "Quit", true, Some("CmdOrCtrl+Q"))
        .map_err(|e| format!("Failed to build system menu quit item: {}", e))?;

    let app_submenu = SubmenuBuilder::new(app, "Clawpit")
        .item(&settings_item)
        .separator()
        .item(&quit_item)
        .build()
        .map_err(|e| format!("Failed to build app submenu: {}", e))?;

    // Edit submenu with native keyboard shortcuts
    let undo = PredefinedMenuItem::undo(app, Some("Undo")).map_err(|e| e.to_string())?;
    let redo = PredefinedMenuItem::redo(app, Some("Redo")).map_err(|e| e.to_string())?;
    let cut = PredefinedMenuItem::cut(app, Some("Cut")).map_err(|e| e.to_string())?;
    let copy = PredefinedMenuItem::copy(app, Some("Copy")).map_err(|e| e.to_string())?;
    let paste = PredefinedMenuItem::paste(app, Some("Paste")).map_err(|e| e.to_string())?;
    let select_all = PredefinedMenuItem::select_all(app, Some("Select All")).map_err(|e| e.to_string())?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&select_all)
        .build()
        .map_err(|e| format!("Failed to build edit submenu: {}", e))?;

    // Window submenu
    let minimize = PredefinedMenuItem::minimize(app, Some("Minimize")).map_err(|e| e.to_string())?;
    let zoom = PredefinedMenuItem::maximize(app, Some("Zoom")).map_err(|e| e.to_string())?;
    let close = PredefinedMenuItem::close_window(app, Some("Close")).map_err(|e| e.to_string())?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .item(&minimize)
        .item(&zoom)
        .separator()
        .item(&close)
        .build()
        .map_err(|e| format!("Failed to build window submenu: {}", e))?;

    let menu = MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&window_submenu)
        .build()
        .map_err(|e| format!("Failed to build system menu: {}", e))?;

    app.set_menu(menu)
        .map_err(|e| format!("Failed to set system menu: {}", e))?;

    Ok(())
}

pub fn handle_tray_menu_event(app: &AppHandle, menu_id: &str) {
    match menu_id {
        APP_SETTINGS_MENU_ID => {
            let _ = open_settings_window_internal(app);
        }
        TRAY_TOGGLE_WINDOW_MENU_ID => {
            let _ = toggle_main_window_internal(app);
        }
        TRAY_START_GATEWAY_MENU_ID => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = update_tray_status_internal(
                    &app_handle,
                    TrayStatus::Transitioning,
                    Some("Starting gateway..."),
                );
                if let Err(error) = start_default_gateway(&app_handle).await {
                    let _ = update_tray_status_internal(
                        &app_handle,
                        TrayStatus::Error,
                        Some("Gateway start failed"),
                    );
                    let _ = app_handle.emit("tray-action-error", error);
                }
            });
        }
        TRAY_STOP_GATEWAY_MENU_ID => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = update_tray_status_internal(
                    &app_handle,
                    TrayStatus::Transitioning,
                    Some("Stopping gateway..."),
                );
                if let Err(error) = stop_default_gateway(&app_handle).await {
                    let _ = update_tray_status_internal(
                        &app_handle,
                        TrayStatus::Error,
                        Some("Gateway stop failed"),
                    );
                    let _ = app_handle.emit("tray-action-error", error);
                }
            });
        }
        TRAY_OPEN_WEB_MENU_ID => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = open_default_web_interface(&app_handle).await {
                    let _ = app_handle.emit("tray-action-error", error);
                }
            });
        }
        TRAY_QUIT_MENU_ID | APP_QUIT_MENU_ID => {
            if let Ok(mut state) = app.state::<Mutex<AppState>>().lock() {
                state.allow_exit = true;
            }
            app.exit(0);
        }
        _ => {}
    }
}

pub fn handle_tray_icon_event(app: &AppHandle, event: &TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        let _ = toggle_main_window_internal(app);
    }
}

fn build_tray_menu(
    app: &AppHandle,
    status: TrayStatus,
    details: Option<&str>,
) -> Result<tauri::menu::Menu<tauri::Wry>, String> {
    let status_label = if let Some(details) = details {
        format!("Status: {} ({})", status.label(), details)
    } else {
        format!("Status: {}", status.label())
    };

    let status_item = MenuItem::with_id(app, "tray-status-item", status_label, false, None::<&str>)
        .map_err(|e| format!("Failed to build tray status item: {}", e))?;

    let toggle_item = MenuItem::with_id(
        app,
        TRAY_TOGGLE_WINDOW_MENU_ID,
        "Show / Hide Clawpit",
        true,
        None::<&str>,
    )
    .map_err(|e| format!("Failed to build tray toggle item: {}", e))?;

    let start_item = MenuItem::with_id(
        app,
        TRAY_START_GATEWAY_MENU_ID,
        "Start Gateway",
        true,
        None::<&str>,
    )
    .map_err(|e| format!("Failed to build tray start item: {}", e))?;

    let stop_item = MenuItem::with_id(
        app,
        TRAY_STOP_GATEWAY_MENU_ID,
        "Stop Gateway",
        true,
        None::<&str>,
    )
    .map_err(|e| format!("Failed to build tray stop item: {}", e))?;

    let open_web_item = MenuItem::with_id(
        app,
        TRAY_OPEN_WEB_MENU_ID,
        "Open Web Interface",
        true,
        None::<&str>,
    )
    .map_err(|e| format!("Failed to build tray open web item: {}", e))?;

    let quit_item = MenuItem::with_id(app, TRAY_QUIT_MENU_ID, "Quit", true, None::<&str>)
        .map_err(|e| format!("Failed to build tray quit item: {}", e))?;

    MenuBuilder::new(app)
        .item(&status_item)
        .separator()
        .item(&toggle_item)
        .item(&start_item)
        .item(&stop_item)
        .item(&open_web_item)
        .separator()
        .item(&quit_item)
        .build()
        .map_err(|e| format!("Failed to build tray menu: {}", e))
}

fn build_tray_icon() -> Image<'static> {
    // Load the icon from embedded bytes
    let base_icon = match image::load_from_memory(TRAY_ICON_BYTES) {
        Ok(img) => img,
        Err(_) => {
            // Fallback to a simple placeholder if icon fails to load
            return build_fallback_icon();
        }
    };

    // Resize to 22x22 for macOS menu bar (will be scaled for Retina)
    let size: u32 = 22;
    let resized = image::imageops::resize(
        &base_icon,
        size,
        size,
        image::imageops::FilterType::Lanczos3,
    );

    // Convert to raw RGBA bytes
    let raw_rgba = resized.into_raw();
    Image::new_owned(raw_rgba, size, size)
}

/// Fallback icon if the main icon fails to load
fn build_fallback_icon() -> Image<'static> {
    // Simple gray circle as fallback
    let size: u32 = 22;
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    let center = (size as f32 - 1.0) / 2.0;
    let outer_radius = size as f32 * 0.45;
    let inner_radius = outer_radius - 1.5;
    let (r, g, b): (u8, u8, u8) = (149, 165, 166); // gray

    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            let idx = ((y * size + x) * 4) as usize;

            if distance <= inner_radius {
                rgba[idx] = r;
                rgba[idx + 1] = g;
                rgba[idx + 2] = b;
                rgba[idx + 3] = 255;
            } else if distance <= outer_radius {
                let alpha = ((outer_radius - distance) / (outer_radius - inner_radius) * 255.0) as u8;
                rgba[idx] = r;
                rgba[idx + 1] = g;
                rgba[idx + 2] = b;
                rgba[idx + 3] = alpha;
            }
        }
    }

    Image::new_owned(rgba, size, size)
}

fn update_tray_status_internal(
    app: &AppHandle,
    status: TrayStatus,
    details: Option<&str>,
) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ICON_ID)
        .ok_or_else(|| "Tray icon not initialized".to_string())?;

    let menu = build_tray_menu(app, status, details)?;
    let tooltip = if let Some(details) = details {
        format!("Clawpit - {} ({})", status.label(), details)
    } else {
        format!("Clawpit - {}", status.label())
    };

    tray.set_menu(Some(menu))
        .map_err(|e| format!("Failed to update tray menu: {}", e))?;
    tray.set_tooltip(Some(tooltip))
        .map_err(|e| format!("Failed to update tray tooltip: {}", e))?;
    // Icon is static, no need to update it on status change
    Ok(())
}

#[tauri::command]
pub fn set_tray_status(
    app: AppHandle,
    status: TrayStatus,
    details: Option<String>,
) -> Result<(), String> {
    update_tray_status_internal(&app, status, details.as_deref())
}

fn get_main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}

fn open_settings_window_internal(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Settings")
    .inner_size(1120.0, 900.0)
    .min_inner_size(920.0, 720.0)
    .center()
    .resizable(true)
    .build()
    .map_err(|e| format!("Failed to create settings window: {}", e))?;

    Ok(())
}

fn show_main_window_internal(app: &AppHandle) -> Result<(), String> {
    let window = get_main_window(app)?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn hide_main_window_internal(app: &AppHandle) -> Result<(), String> {
    let window = get_main_window(app)?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

fn toggle_main_window_internal(app: &AppHandle) -> Result<bool, String> {
    let window = get_main_window(app)?;
    let is_visible = window.is_visible().map_err(|e| e.to_string())?;
    if is_visible {
        window.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    show_main_window_internal(&app)
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<(), String> {
    hide_main_window_internal(&app)
}

#[tauri::command]
pub fn toggle_main_window(app: AppHandle) -> Result<bool, String> {
    toggle_main_window_internal(&app)
}

#[tauri::command]
pub fn is_main_window_visible(app: AppHandle) -> Result<bool, String> {
    let window = get_main_window(&app)?;
    window.is_visible().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings_window_internal(&app)
}

fn read_clawpit_dir_from_state(app: &AppHandle) -> Result<String, String> {
    let state = app.state::<Mutex<AppState>>();
    let guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(dir) = &guard.clawpit_dir {
        return Ok(dir.clone());
    }

    Ok(crate::commands::instance::get_default_clawpit_paths().clawpit_dir)
}

fn read_wsl_distro_from_state(app: &AppHandle) -> Option<String> {
    let state = app.state::<Mutex<AppState>>();
    let guard = state.lock().ok()?;
    guard.wsl_distro.clone()
}

fn resolve_default_instance_id(clawpit_dir: &Path) -> Result<String, String> {
    let clawpit_config = clawpit_dir.join("config.json");
    if clawpit_config.exists() {
        let content = fs::read_to_string(&clawpit_config)
            .map_err(|e| format!("Failed to read clawpit config: {}", e))?;
        let json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse clawpit config: {}", e))?;
        if let Some(id) = json["defaultInstance"].as_str() {
            if !id.trim().is_empty() {
                return Ok(id.to_string());
            }
        }
    }

    let instances_dir = clawpit_dir.join("instances");
    if !instances_dir.exists() {
        return Err("No instances found. Create an instance first.".to_string());
    }

    let mut instance_ids: Vec<String> = fs::read_dir(instances_dir)
        .map_err(|e| format!("Failed to read instances: {}", e))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            if path.is_dir() && path.join("instance.json").exists() {
                path.file_name()
                    .map(|name| name.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect();

    instance_ids.sort();
    instance_ids
        .into_iter()
        .next()
        .ok_or_else(|| "No instances found. Create an instance first.".to_string())
}

fn resolve_default_gateway_url(clawpit_dir: &Path) -> Result<String, String> {
    let instance_id = resolve_default_instance_id(clawpit_dir)?;
    let instance_config_path = clawpit_dir
        .join("instances")
        .join(&instance_id)
        .join("instance.json");

    let config_content = fs::read_to_string(&instance_config_path)
        .map_err(|e| format!("Failed to read instance config: {}", e))?;
    let config_json: serde_json::Value = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse instance config: {}", e))?;

    let gateway_port = config_json["gatewayPort"]
        .as_u64()
        .ok_or_else(|| "Gateway port not found in instance config".to_string())?;

    Ok(format!("http://127.0.0.1:{}", gateway_port))
}

async fn start_default_gateway(app: &AppHandle) -> Result<(), String> {
    let clawpit_dir = read_clawpit_dir_from_state(app)?;
    let instance_id = resolve_default_instance_id(Path::new(&clawpit_dir))?;
    let wsl_distro = read_wsl_distro_from_state(app);

    start_instance(app.clone(), clawpit_dir, instance_id.clone(), wsl_distro).await?;
    let _ = app.emit(
        "tray-gateway-action",
        serde_json::json!({ "action": "started", "instanceId": instance_id }),
    );
    let _ = update_tray_status_internal(app, TrayStatus::Running, Some("Gateway running"));
    Ok(())
}

async fn stop_default_gateway(app: &AppHandle) -> Result<(), String> {
    let clawpit_dir = read_clawpit_dir_from_state(app)?;
    let instance_id = resolve_default_instance_id(Path::new(&clawpit_dir))?;
    let wsl_distro = read_wsl_distro_from_state(app);

    stop_instance(app.clone(), clawpit_dir, instance_id.clone(), wsl_distro).await?;
    let _ = app.emit(
        "tray-gateway-action",
        serde_json::json!({ "action": "stopped", "instanceId": instance_id }),
    );
    let _ = update_tray_status_internal(app, TrayStatus::Error, Some("Gateway stopped"));
    Ok(())
}

async fn open_default_web_interface(app: &AppHandle) -> Result<(), String> {
    let clawpit_dir = read_clawpit_dir_from_state(app)?;
    let url = resolve_default_gateway_url(Path::new(&clawpit_dir))?;
    open::that(&url).map_err(|e| format!("Failed to open browser: {}", e))?;
    let _ = app.emit("tray-open-web", serde_json::json!({ "url": url }));
    Ok(())
}

pub fn apply_start_minimized_if_enabled(app: &AppHandle) -> Result<(), String> {
    let config = crate::commands::config::read_app_config(app)?;
    if config.preferences.start_minimized {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Main window not found".to_string())?;
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
