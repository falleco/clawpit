// Docker-related Tauri commands

use crate::models::{CommandOutput, DependencyStatus};
use crate::platform::{create_executor, detect_platform};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::commands::AppState;

/// Check if Docker is installed
#[tauri::command]
pub async fn check_docker_installed(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<DependencyStatus, String> {
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let executor = create_executor(&app, wsl_distro);
    let output = executor.run_docker(&["--version"]).await?;

    let version = if output.success {
        // Parse version from output like "Docker version 24.0.5, build ced0996"
        let stdout = output.stdout.trim();
        Some(
            stdout
                .split(',')
                .next()
                .unwrap_or(stdout)
                .replace("Docker version ", "")
                .trim()
                .to_string(),
        )
    } else {
        None
    };

    Ok(DependencyStatus {
        installed: output.success,
        running: None, // Will be checked separately
        version,
        error: if output.success {
            None
        } else {
            Some(output.stderr)
        },
    })
}

/// Check if Docker daemon is running
#[tauri::command]
pub async fn check_docker_running(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<DependencyStatus, String> {
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let executor = create_executor(&app, wsl_distro);

    // First check if installed
    let version_output = executor.run_docker(&["--version"]).await?;
    if !version_output.success {
        return Ok(DependencyStatus {
            installed: false,
            running: Some(false),
            version: None,
            error: Some("Docker is not installed".to_string()),
        });
    }

    // Then check if running by running `docker info`
    let info_output = executor.run_docker(&["info"]).await?;

    let version = version_output
        .stdout
        .split(',')
        .next()
        .unwrap_or(&version_output.stdout)
        .replace("Docker version ", "")
        .trim()
        .to_string();

    Ok(DependencyStatus {
        installed: true,
        running: Some(info_output.success),
        version: Some(version),
        error: if info_output.success {
            None
        } else {
            Some("Docker daemon is not running".to_string())
        },
    })
}

/// Get Docker version information
#[tauri::command]
pub async fn get_docker_version(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let executor = create_executor(&app, wsl_distro);
    let output = executor.run_docker(&["--version"]).await?;

    if output.success {
        Ok(output.stdout.trim().to_string())
    } else {
        Err(format!("Failed to get Docker version: {}", output.stderr))
    }
}

/// Check if Docker Compose v2 is available
#[tauri::command]
pub async fn check_docker_compose(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<DependencyStatus, String> {
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let executor = create_executor(&app, wsl_distro);

    // Check for Docker Compose v2 (docker compose version)
    let output = executor.run_docker_compose(&["version"], None).await?;

    let version = if output.success {
        // Parse version from output like "Docker Compose version v2.21.0"
        let stdout = output.stdout.trim();
        Some(
            stdout
                .lines()
                .next()
                .unwrap_or(stdout)
                .replace("Docker Compose version ", "")
                .trim()
                .to_string(),
        )
    } else {
        None
    };

    Ok(DependencyStatus {
        installed: output.success,
        running: None, // Not applicable for compose
        version,
        error: if output.success {
            None
        } else {
            Some("Docker Compose v2 is not available. Make sure Docker is installed with the Compose plugin.".to_string())
        },
    })
}

/// Run a Docker Compose command
#[tauri::command]
pub async fn run_docker_compose(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    args: Vec<String>,
    working_dir: Option<String>,
) -> Result<CommandOutput, String> {
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let executor = create_executor(&app, wsl_distro);
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let working_path = working_dir.as_ref().map(std::path::Path::new);

    executor.run_docker_compose(&args_ref, working_path).await
}

/// Get the current platform
#[tauri::command]
pub fn get_platform() -> String {
    detect_platform().to_string()
}
