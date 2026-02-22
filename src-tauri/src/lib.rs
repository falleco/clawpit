// Clawpit - OpenClaw Desktop Manager
// A Tauri v2 application for managing OpenClaw services

use std::sync::Mutex;
use tauri::Manager;
use tauri::WindowEvent;

// Module declarations
pub mod commands;
pub mod models;
pub mod platform;

// Re-export commonly used types
pub use commands::AppState;
pub use models::*;
pub use platform::detect_platform;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Core plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_liquid_glass::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        // Manage application state
        .manage(Mutex::new(AppState::default()))
        // Setup hook for initialization
        .setup(|app| {
            commands::runtime::init_system_tray(&app.handle())?;
            commands::runtime::init_system_menu(&app.handle())?;
            commands::runtime::apply_start_minimized_if_enabled(&app.handle())?;

            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            commands::runtime::handle_tray_menu_event(app, event.id().as_ref());
        })
        .on_tray_icon_event(|app, event| {
            commands::runtime::handle_tray_icon_event(app, &event);
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Some(app_config) =
                    commands::config::read_app_config(&window.app_handle()).ok()
                {
                    if app_config.preferences.minimize_to_tray {
                        let should_prevent = {
                            let state = window.app_handle().state::<Mutex<AppState>>();
                            state.lock().map(|s| !s.allow_exit).unwrap_or(true)
                        };

                        if should_prevent {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                }
            }
        })
        // Register all command handlers
        .invoke_handler(tauri::generate_handler![
            // Platform commands
            commands::platform::get_current_platform,
            commands::platform::is_windows,
            commands::platform::check_wsl_installed,
            commands::platform::get_wsl_distros,
            commands::platform::get_default_wsl_distro,
            commands::platform::set_default_wsl_distro,
            commands::platform::set_wsl_distro,
            commands::platform::get_wsl_status,
            commands::platform::start_wsl_distro,
            commands::platform::shutdown_wsl_distro,
            commands::platform::set_wsl_default_version_2,
            commands::platform::convert_distro_to_wsl2,
            commands::platform::validate_wsl_distro_tools,
            commands::platform::get_wsl_version_info,
            // Docker commands
            commands::docker::check_docker_installed,
            commands::docker::check_docker_running,
            commands::docker::get_docker_version,
            commands::docker::check_docker_compose,
            commands::docker::run_docker_compose,
            commands::docker::get_platform,
            // Git commands
            commands::git::check_git_installed,
            commands::git::get_git_version,
            commands::git::git_clone,
            commands::git::git_pull,
            // Configuration commands
            commands::config::get_config,
            commands::config::save_config,
            commands::config::get_default_paths,
            commands::config::validate_config,
            commands::config::reset_config,
            commands::config::check_directory,
            commands::config::create_directory,
            commands::config::export_config_to_file,
            commands::config::import_config_from_file,
            // Settings and configuration editor commands
            commands::settings::list_configurable_instances,
            commands::settings::get_instance_configuration_bundle,
            commands::settings::save_instance_openclaw_config,
            commands::settings::update_instance_env_var,
            commands::settings::reset_instance_env_var,
            commands::settings::save_instance_compose_customization,
            commands::settings::factory_reset_clawpit,
            // Instance commands
            commands::instance::check_clawpit_state,
            commands::instance::get_default_clawpit_paths,
            commands::instance::validate_clawpit_directory,
            commands::instance::create_clawpit_structure,
            commands::instance::create_instance,
            commands::instance::list_instances,
            commands::instance::get_instance,
            commands::instance::update_instance,
            commands::instance::delete_instance,
            commands::instance::get_next_available_ports,
            commands::instance::touch_instance,
            commands::instance::check_port_available,
            commands::instance::check_port_with_conflicts,
            commands::instance::generate_secure_token,
            commands::instance::validate_token,
            commands::instance::run_installation,
            commands::instance::start_instance,
            commands::instance::stop_instance,
            commands::instance::restart_instance,
            commands::instance::get_instance_status,
            commands::instance::get_instance_containers_info,
            commands::instance::get_instance_agents,
            commands::instance::execute_instance_cli_command,
            commands::instance::get_instance_logs,
            commands::instance::get_instance_logs_enhanced,
            commands::instance::get_instance_services,
            commands::instance::get_system_info_for_logs,
            commands::instance::remove_instance_containers,
            commands::instance::pull_instance_updates,
            commands::instance::get_instance_extended_status,
            commands::instance::get_all_instances_status,
            commands::instance::start_all_instances,
            commands::instance::stop_all_instances,
            commands::instance::start_model_auth,
            // Core services commands (egress proxy, networks)
            commands::instance::ensure_core_services,
            commands::instance::get_core_services_status,
            commands::instance::get_egress_logs,
            commands::instance::stop_core_services,
            // OAuth commands
            commands::oauth::start_openai_oauth,
            commands::oauth::check_openai_auth,
            commands::oauth::refresh_openai_tokens,
            // Health check commands
            commands::health::check_prerequisites,
            commands::health::get_gateway_status,
            commands::health::get_instance_health_metrics,
            commands::health::get_health_summary,
            commands::health::get_health_monitoring_config,
            commands::health::save_health_monitoring_config,
            commands::health::check_gateway_connectivity,
            commands::health::trigger_instance_recovery,
            commands::health::send_health_notification,
            // Template commands
            commands::templates::list_templates,
            commands::templates::get_template,
            // Runtime / tray commands
            commands::runtime::set_tray_status,
            commands::runtime::show_main_window,
            commands::runtime::hide_main_window,
            commands::runtime::toggle_main_window,
            commands::runtime::is_main_window_visible,
            commands::runtime::open_settings_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
