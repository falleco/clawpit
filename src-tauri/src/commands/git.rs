use crate::commands::AppState;
use crate::models::DependencyStatus;
use crate::platform::create_executor;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State};

fn validate_repository_url(url: &str) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("Repository URL cannot be empty".to_string());
    }

    let allowed_prefixes = [
        "https://github.com/",
        "git@github.com:",
        "https://gitlab.com/",
        "git@gitlab.com:",
    ];

    if allowed_prefixes.iter().any(|prefix| url.starts_with(prefix)) {
        Ok(())
    } else {
        Err("Only GitHub and GitLab repositories are allowed".to_string())
    }
}

/// Check if Git is installed
#[tauri::command]
pub async fn check_git_installed(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<DependencyStatus, String> {
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let executor = create_executor(&app, wsl_distro);
    let output = executor.run_git(&["--version"], None).await?;

    let version = if output.success {
        Some(
            output
                .stdout
                .trim()
                .replace("git version ", "")
                .to_string(),
        )
    } else {
        None
    };

    Ok(DependencyStatus {
        installed: output.success,
        running: None,
        version,
        error: if output.success {
            None
        } else {
            Some(output.stderr)
        },
    })
}

/// Get Git version information
#[tauri::command]
pub async fn get_git_version(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let executor = create_executor(&app, wsl_distro);
    let output = executor.run_git(&["--version"], None).await?;

    if output.success {
        Ok(output.stdout.trim().to_string())
    } else {
        Err(format!("Failed to get Git version: {}", output.stderr))
    }
}

/// Clone a repository into target directory
#[tauri::command]
pub async fn git_clone(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    repo_url: String,
    target_dir: String,
) -> Result<String, String> {
    validate_repository_url(&repo_url)?;

    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let target_path = PathBuf::from(&target_dir);
    let parent_dir = target_path
        .parent()
        .ok_or_else(|| "Invalid target directory".to_string())?;

    let target_name = target_path
        .file_name()
        .ok_or_else(|| "Invalid target directory".to_string())?
        .to_string_lossy()
        .to_string();

    let executor = create_executor(&app, wsl_distro);
    let output = executor
        .run_git(&["clone", &repo_url, &target_name], Some(parent_dir))
        .await?;

    if output.success {
        Ok(output.stdout)
    } else {
        Err(output.stderr)
    }
}

/// Pull updates from current branch
#[tauri::command]
pub async fn git_pull(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    repo_dir: String,
) -> Result<String, String> {
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    let executor = create_executor(&app, wsl_distro);
    let repo_path = PathBuf::from(repo_dir);
    let output = executor
        .run_git(&["pull", "--ff-only"], Some(&repo_path))
        .await?;

    if output.success {
        Ok(output.stdout)
    } else {
        Err(output.stderr)
    }
}
