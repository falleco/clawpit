// Platform detection and WSL management commands

use crate::commands::AppState;
use crate::models::{Platform, WslDistro, WslStatus};
use crate::platform::detect_platform;
use std::sync::Mutex;
use tauri::State;

/// Get the current platform
#[tauri::command]
pub fn get_current_platform() -> Platform {
    detect_platform()
}

/// Check if running on Windows
#[tauri::command]
pub fn is_windows() -> bool {
    detect_platform() == Platform::Windows
}

/// Check if WSL is installed (Windows only)
#[tauri::command]
pub async fn check_wsl_installed() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        crate::platform::windows::check_wsl_installed().await
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// Get list of WSL distributions (Windows only)
#[tauri::command]
pub async fn get_wsl_distros() -> Result<Vec<WslDistro>, String> {
    #[cfg(target_os = "windows")]
    {
        let distros = crate::platform::windows::list_wsl_distros().await?;
        Ok(distros
            .into_iter()
            .map(|(name, is_default, wsl_version, state)| WslDistro {
                name,
                is_default,
                wsl_version,
                state,
            })
            .collect())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

/// Get the default WSL distribution (Windows only)
#[tauri::command]
pub async fn get_default_wsl_distro() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        crate::platform::windows::get_default_wsl_distro().await
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

/// Set the default WSL distribution (Windows only)
#[tauri::command]
pub async fn set_default_wsl_distro(_name: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        crate::platform::windows::set_default_wsl_distro(&name).await
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("WSL is only available on Windows".to_string())
    }
}

/// Set the WSL distribution to use for commands
#[tauri::command]
pub fn set_wsl_distro(state: State<'_, Mutex<AppState>>, distro: String) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.wsl_distro = Some(distro);
    Ok(())
}

/// Start a WSL distribution (Windows only)
#[tauri::command]
pub async fn start_wsl_distro(name: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        crate::platform::windows::start_wsl_distro(&name).await
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = name;
        Err("WSL is only available on Windows".to_string())
    }
}

/// Shutdown a WSL distribution (Windows only)
#[tauri::command]
pub async fn shutdown_wsl_distro(name: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        crate::platform::windows::shutdown_wsl_distro(&name).await
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = name;
        Err("WSL is only available on Windows".to_string())
    }
}

/// Set WSL default version to 2 (Windows only)
#[tauri::command]
pub async fn set_wsl_default_version_2() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        crate::platform::windows::set_wsl_default_version_2().await
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("WSL is only available on Windows".to_string())
    }
}

/// Convert a distribution to WSL2 (Windows only)
#[tauri::command]
pub async fn convert_distro_to_wsl2(name: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        crate::platform::windows::convert_distro_to_wsl2(&name).await
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = name;
        Err("WSL is only available on Windows".to_string())
    }
}

/// Validate that a WSL distribution has required tools (Windows only)
#[tauri::command]
pub async fn validate_wsl_distro_tools(name: String) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "windows")]
    {
        let validation = crate::platform::windows::validate_wsl_distro_tools(&name).await?;
        serde_json::to_value(validation).map_err(|e| e.to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = name;
        Err("WSL is only available on Windows".to_string())
    }
}

/// Get WSL version information (Windows only)
#[tauri::command]
pub async fn get_wsl_version_info() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "windows")]
    {
        let info = crate::platform::windows::get_wsl_version_info().await?;
        serde_json::to_value(info).map_err(|e| e.to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("WSL is only available on Windows".to_string())
    }
}

/// Get comprehensive WSL status (Windows only)
#[tauri::command]
pub async fn get_wsl_status() -> Result<WslStatus, String> {
    #[cfg(target_os = "windows")]
    {
        use crate::platform::windows::{check_wsl_installed, list_wsl_distros};

        let installed = check_wsl_installed().await.unwrap_or(false);

        if !installed {
            return Ok(WslStatus {
                installed: false,
                is_wsl2: false,
                distributions: vec![],
                default_distro: None,
                error: Some("WSL is not installed".to_string()),
            });
        }

        let distros_result = list_wsl_distros().await;
        let (distributions, default_distro, is_wsl2) = match distros_result {
            Ok(distros) => {
                let mapped: Vec<WslDistro> = distros
                    .iter()
                    .map(|(name, is_default, version, state)| WslDistro {
                        name: name.clone(),
                        is_default: *is_default,
                        wsl_version: *version,
                        state: state.clone(),
                    })
                    .collect();

                let default = mapped.iter().find(|d| d.is_default).map(|d| d.name.clone());
                let has_wsl2 = mapped.iter().any(|d| d.wsl_version == 2);

                (mapped, default, has_wsl2)
            }
            Err(e) => {
                return Ok(WslStatus {
                    installed: true,
                    is_wsl2: false,
                    distributions: vec![],
                    default_distro: None,
                    error: Some(e),
                });
            }
        };

        Ok(WslStatus {
            installed,
            is_wsl2,
            distributions,
            default_distro,
            error: None,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(WslStatus {
            installed: false,
            is_wsl2: false,
            distributions: vec![],
            default_distro: None,
            error: Some("WSL is only available on Windows".to_string()),
        })
    }
}
