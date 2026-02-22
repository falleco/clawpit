// Platform abstraction layer for cross-platform command execution

mod linux;
mod macos;
mod windows;

use async_trait::async_trait;
use crate::models::{CommandOutput, Platform};
use std::path::Path;
use tauri::AppHandle;

// Re-export platform implementations
pub use linux::LinuxExecutor;
pub use macos::MacOSExecutor;
pub use windows::WindowsExecutor;

/// Detect the current platform
pub fn detect_platform() -> Platform {
    #[cfg(target_os = "windows")]
    return Platform::Windows;

    #[cfg(target_os = "macos")]
    return Platform::MacOS;

    #[cfg(target_os = "linux")]
    return Platform::Linux;

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return Platform::Linux; // Default fallback
}

/// Trait for platform-agnostic command execution
#[async_trait]
pub trait CommandExecutor: Send + Sync {
    /// Run a Docker command
    async fn run_docker(&self, args: &[&str]) -> Result<CommandOutput, String>;

    /// Run a Docker Compose command
    async fn run_docker_compose(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String>;

    /// Run a Docker Compose command with TTY allocation (for interactive commands)
    /// This adds the -t flag to docker compose run commands
    async fn run_docker_compose_with_tty(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String>;

    /// Run a Git command
    async fn run_git(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String>;

    /// Get the platform type
    fn platform(&self) -> Platform;

    /// Check if this is Windows (convenience method)
    fn is_windows(&self) -> bool {
        self.platform() == Platform::Windows
    }

    /// Convert a native path to the appropriate format for command execution
    fn normalize_path(&self, path: &str) -> String;
}

/// Create the appropriate executor for the current platform
pub fn create_executor(
    app: &AppHandle,
    wsl_distro: Option<String>,
) -> Box<dyn CommandExecutor> {
    match detect_platform() {
        Platform::Windows => Box::new(WindowsExecutor::new(app.clone(), wsl_distro)),
        Platform::MacOS => Box::new(MacOSExecutor::new(app.clone())),
        Platform::Linux => Box::new(LinuxExecutor::new(app.clone())),
    }
}

/// Convert Windows path to WSL path format
/// C:\Users\name\.openclaw -> /mnt/c/Users/name/.openclaw
pub fn windows_to_wsl_path(windows_path: &str) -> String {
    let path = windows_path.replace('\\', "/");

    // Handle drive letter: C: -> /mnt/c
    if path.len() >= 2 && path.chars().nth(1) == Some(':') {
        let drive = path.chars().next().unwrap().to_lowercase().next().unwrap();
        format!("/mnt/{}{}", drive, &path[2..])
    } else {
        path
    }
}

/// Convert WSL path to Windows UNC path for file access
/// /home/user/.openclaw -> \\wsl$\Ubuntu\home\user\.openclaw
pub fn wsl_to_windows_unc(wsl_path: &str, distro: &str) -> String {
    format!("\\\\wsl$\\{}{}", distro, wsl_path.replace('/', "\\"))
}

/// Parse command output into our CommandOutput struct
pub fn parse_output(output: std::process::Output) -> CommandOutput {
    CommandOutput {
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_windows_to_wsl_path() {
        assert_eq!(
            windows_to_wsl_path("C:\\Users\\name\\.openclaw"),
            "/mnt/c/Users/name/.openclaw"
        );
        assert_eq!(windows_to_wsl_path("D:\\data"), "/mnt/d/data");
        assert_eq!(
            windows_to_wsl_path("C:\\Program Files\\App"),
            "/mnt/c/Program Files/App"
        );
    }

    #[test]
    fn test_wsl_to_windows_unc() {
        assert_eq!(
            wsl_to_windows_unc("/home/user/.openclaw", "Ubuntu"),
            "\\\\wsl$\\Ubuntu\\home\\user\\.openclaw"
        );
    }
}
