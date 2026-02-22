// Configuration management Tauri commands

use crate::models::{AppConfig, DefaultPaths, Platform};
use crate::platform::detect_platform;
use serde_json;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;

/// Get the app configuration directory
fn get_config_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;

    // Ensure directory exists
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(config_dir.join("config.json"))
}

pub fn read_app_config(app: &AppHandle) -> Result<AppConfig, String> {
    let config_path = get_config_file_path(app)?;

    if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;

        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config file: {}", e))
    } else {
        let defaults = get_default_paths_internal();
        Ok(AppConfig {
            openclaw_dir: defaults.config_dir,
            workspace_dir: defaults.workspace_dir,
            wsl_distro: if detect_platform() == Platform::Windows {
                Some("Ubuntu".to_string())
            } else {
                None
            },
            ..Default::default()
        })
    }
}

fn sync_runtime_state(
    state: &State<'_, Mutex<AppState>>,
    config: &AppConfig,
) -> Result<(), String> {
    let mut app_state = state.lock().map_err(|e| e.to_string())?;
    app_state.clawpit_dir = Some(config.openclaw_dir.clone());
    app_state.wsl_distro = config.wsl_distro.clone();
    Ok(())
}

fn escape_shell_double_quotes(value: &str) -> String {
    value.replace('"', "\\\"")
}

fn configure_start_on_boot(app: &AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get executable path: {}", e))?;
        let value_data = format!("\"{}\"", exe_path.to_string_lossy());
        let run_key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

        if enabled {
            let output = Command::new("reg")
                .args([
                    "add",
                    run_key,
                    "/v",
                    "Clawpit",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &value_data,
                    "/f",
                ])
                .output()
                .map_err(|e| format!("Failed to register startup entry: {}", e))?;

            if !output.status.success() {
                return Err(format!(
                    "Failed to enable start on boot: {}",
                    String::from_utf8_lossy(&output.stderr)
                ));
            }
        } else {
            let output = Command::new("reg")
                .args(["delete", run_key, "/v", "Clawpit", "/f"])
                .output()
                .map_err(|e| format!("Failed to remove startup entry: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
                if !stderr.contains("unable to find")
                    && !stderr.contains("cannot find")
                    && !stderr.contains("not found")
                {
                    return Err(format!(
                        "Failed to disable start on boot: {}",
                        String::from_utf8_lossy(&output.stderr)
                    ));
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let home_dir = app
            .path()
            .home_dir()
            .map_err(|e| format!("Failed to resolve home directory: {}", e))?;
        let launch_agents_dir = home_dir.join("Library").join("LaunchAgents");
        let plist_path = launch_agents_dir.join("com.clawpit.desktop.plist");

        if enabled {
            fs::create_dir_all(&launch_agents_dir)
                .map_err(|e| format!("Failed to create LaunchAgents directory: {}", e))?;

            let exe_path = std::env::current_exe()
                .map_err(|e| format!("Failed to get executable path: {}", e))?;
            let escaped_exe = escape_shell_double_quotes(&exe_path.to_string_lossy());

            let plist = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.clawpit.desktop</string>
  <key>ProgramArguments</key>
  <array>
    <string>{}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
"#,
                escaped_exe
            );

            fs::write(&plist_path, plist)
                .map_err(|e| format!("Failed to write LaunchAgent file: {}", e))?;
        } else if plist_path.exists() {
            fs::remove_file(&plist_path)
                .map_err(|e| format!("Failed to remove LaunchAgent file: {}", e))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        let home_dir = app
            .path()
            .home_dir()
            .map_err(|e| format!("Failed to resolve home directory: {}", e))?;
        let autostart_dir = home_dir.join(".config").join("autostart");
        let desktop_entry_path = autostart_dir.join("clawpit.desktop");

        if enabled {
            fs::create_dir_all(&autostart_dir)
                .map_err(|e| format!("Failed to create autostart directory: {}", e))?;

            let exe_path = std::env::current_exe()
                .map_err(|e| format!("Failed to get executable path: {}", e))?;
            let escaped_exe = escape_shell_double_quotes(&exe_path.to_string_lossy());
            let desktop_entry = format!(
                "[Desktop Entry]\nType=Application\nVersion=1.0\nName=Clawpit\nComment=OpenClaw Desktop Manager\nExec=\"{}\"\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
                escaped_exe
            );

            fs::write(&desktop_entry_path, desktop_entry)
                .map_err(|e| format!("Failed to write autostart entry: {}", e))?;
        } else if desktop_entry_path.exists() {
            fs::remove_file(&desktop_entry_path)
                .map_err(|e| format!("Failed to remove autostart entry: {}", e))?;
        }
    }

    Ok(())
}

fn persist_config_to_disk(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    validate_config_internal(config)?;

    let config_path = get_config_file_path(app)?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content).map_err(|e| format!("Failed to write config file: {}", e))?;
    configure_start_on_boot(app, config.preferences.start_on_boot)?;
    Ok(())
}

/// Get the current application configuration
#[tauri::command]
pub async fn get_config(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<AppConfig, String> {
    let config = read_app_config(&app)?;
    sync_runtime_state(&state, &config)?;
    Ok(config)
}

/// Save the application configuration
#[tauri::command]
pub async fn save_config(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    config: AppConfig,
) -> Result<(), String> {
    persist_config_to_disk(&app, &config)?;
    sync_runtime_state(&state, &config)?;

    Ok(())
}

/// Get platform-specific default paths
#[tauri::command]
pub fn get_default_paths() -> DefaultPaths {
    get_default_paths_internal()
}

fn get_default_paths_internal() -> DefaultPaths {
    let platform = detect_platform();

    match platform {
        Platform::Windows => {
            // For Windows, recommend WSL paths for performance
            let wsl_home = "/home/$USER/.openclaw";
            DefaultPaths {
                config_dir: wsl_home.to_string(),
                workspace_dir: format!("{}/workspace", wsl_home),
                windows_unc_path: Some("\\\\wsl$\\Ubuntu\\home\\$USER\\.openclaw".to_string()),
            }
        }
        Platform::MacOS | Platform::Linux => {
            // Use standard Unix paths
            let home = std::env::var("HOME").unwrap_or_else(|_| "/home/user".to_string());
            let config_dir = format!("{}/.openclaw", home);
            DefaultPaths {
                config_dir: config_dir.clone(),
                workspace_dir: format!("{}/workspace", config_dir),
                windows_unc_path: None,
            }
        }
    }
}

/// Validate configuration values
#[tauri::command]
pub fn validate_config(config: AppConfig) -> Result<(), String> {
    validate_config_internal(&config)
}

fn validate_config_internal(config: &AppConfig) -> Result<(), String> {
    // Validate openclaw_dir
    if config.openclaw_dir.is_empty() {
        return Err("OpenClaw directory cannot be empty".to_string());
    }

    // Validate workspace_dir
    if config.workspace_dir.is_empty() {
        return Err("Workspace directory cannot be empty".to_string());
    }

    // Validate ports
    if config.network.gateway_port == 0 {
        return Err("Gateway port cannot be 0".to_string());
    }

    if config.network.bridge_port == 0 {
        return Err("Bridge port cannot be 0".to_string());
    }

    if config.network.gateway_port == config.network.bridge_port {
        return Err("Gateway and bridge ports cannot be the same".to_string());
    }

    // Validate WSL distro on Windows
    if detect_platform() == Platform::Windows && config.wsl_distro.is_none() {
        return Err("WSL distribution must be specified on Windows".to_string());
    }

    Ok(())
}

/// Reset configuration to defaults
#[tauri::command]
pub async fn reset_config(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<AppConfig, String> {
    let config_path = get_config_file_path(&app)?;

    // Delete existing config
    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to delete config file: {}", e))?;
    }

    configure_start_on_boot(&app, false)?;

    // Return fresh default config
    get_config(app, state).await
}

/// Check if a directory exists and is writable
#[tauri::command]
pub async fn check_directory(path: String) -> Result<DirectoryStatus, String> {
    let path_buf = PathBuf::from(&path);

    let exists = path_buf.exists();
    let is_dir = path_buf.is_dir();

    // Try to check if writable by creating a temp file
    let writable = if exists && is_dir {
        let test_file = path_buf.join(".clawpit_write_test");
        match fs::write(&test_file, "test") {
            Ok(_) => {
                let _ = fs::remove_file(&test_file);
                true
            }
            Err(_) => false,
        }
    } else {
        false
    };

    Ok(DirectoryStatus {
        path,
        exists,
        is_directory: is_dir,
        writable,
    })
}

/// Directory status information
#[derive(serde::Serialize)]
pub struct DirectoryStatus {
    pub path: String,
    pub exists: bool,
    pub is_directory: bool,
    pub writable: bool,
}

/// Create a directory if it doesn't exist
#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory '{}': {}", path, e))
}

/// Export the current app configuration to a file
#[tauri::command]
pub async fn export_config_to_file(app: AppHandle, file_path: String) -> Result<(), String> {
    let config = read_app_config(&app)?;
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config for export: {}", e))?;
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to export config to '{}': {}", file_path, e))?;
    Ok(())
}

/// Import app configuration from a file
#[tauri::command]
pub async fn import_config_from_file(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    file_path: String,
) -> Result<AppConfig, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read imported config '{}': {}", file_path, e))?;

    let imported: AppConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid config format in imported file: {}", e))?;

    persist_config_to_disk(&app, &imported)?;
    sync_runtime_state(&state, &imported)?;

    Ok(imported)
}
