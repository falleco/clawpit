// Windows platform implementation - executes commands via WSL2

use async_trait::async_trait;
use crate::models::{CommandOutput, Platform};
use crate::platform::{parse_output, windows_to_wsl_path, CommandExecutor};
use std::path::Path;
use std::process::Command;
use tauri::AppHandle;

/// Windows command executor that routes commands through WSL2
pub struct WindowsExecutor {
    #[allow(dead_code)]
    app: AppHandle,
    /// The WSL distribution to use for command execution
    wsl_distro: String,
}

impl WindowsExecutor {
    pub fn new(app: AppHandle, wsl_distro: Option<String>) -> Self {
        Self {
            app,
            // Default to Ubuntu if not specified
            wsl_distro: wsl_distro.unwrap_or_else(|| "Ubuntu".to_string()),
        }
    }

    /// Execute a command through WSL
    fn run_wsl_command(
        &self,
        program: &str,
        args: &[&str],
        working_dir: Option<&str>,
    ) -> Result<CommandOutput, String> {
        let mut wsl_args = vec!["-d", &self.wsl_distro];

        // Add working directory if specified
        if let Some(dir) = working_dir {
            wsl_args.push("--cd");
            wsl_args.push(dir);
        }

        wsl_args.push("--");
        wsl_args.push(program);
        wsl_args.extend(args);

        let output = Command::new("wsl")
            .args(&wsl_args)
            .output()
            .map_err(|e| format!("Failed to execute WSL command: {}", e))?;

        Ok(parse_output(output))
    }
}

#[async_trait]
impl CommandExecutor for WindowsExecutor {
    async fn run_docker(&self, args: &[&str]) -> Result<CommandOutput, String> {
        self.run_wsl_command("docker", args, None)
    }

    async fn run_docker_compose(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String> {
        let mut compose_args = vec!["compose"];
        compose_args.extend(args);

        let wsl_dir = working_dir.map(|p| {
            let path_str = p.to_string_lossy();
            // Convert Windows path to WSL path if needed
            if path_str.contains('\\')
                || (path_str.len() >= 2 && path_str.chars().nth(1) == Some(':'))
            {
                windows_to_wsl_path(&path_str)
            } else {
                path_str.to_string()
            }
        });

        self.run_wsl_command("docker", &compose_args, wsl_dir.as_deref())
    }

    async fn run_docker_compose_with_tty(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String> {
        // For commands that require TTY (like interactive auth flows),
        // we add -T to disable pseudo-TTY allocation and allow non-interactive execution
        let mut compose_args: Vec<&str> = vec!["compose"];

        // Check if this is a "run" command and add -T flag after "run"
        let mut args_iter = args.iter();
        if let Some(&first) = args_iter.next() {
            compose_args.push(first);
            if first == "run" {
                // Add -T to disable pseudo-TTY allocation (allows non-interactive execution)
                compose_args.push("-T");
            }
            compose_args.extend(args_iter.map(|s| *s));
        }

        let wsl_dir = working_dir.map(|p| {
            let path_str = p.to_string_lossy();
            // Convert Windows path to WSL path if needed
            if path_str.contains('\\')
                || (path_str.len() >= 2 && path_str.chars().nth(1) == Some(':'))
            {
                windows_to_wsl_path(&path_str)
            } else {
                path_str.to_string()
            }
        });

        self.run_wsl_command("docker", &compose_args, wsl_dir.as_deref())
    }

    async fn run_git(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String> {
        let wsl_dir = working_dir.map(|p| {
            let path_str = p.to_string_lossy();
            if path_str.contains('\\')
                || (path_str.len() >= 2 && path_str.chars().nth(1) == Some(':'))
            {
                windows_to_wsl_path(&path_str)
            } else {
                path_str.to_string()
            }
        });

        self.run_wsl_command("git", args, wsl_dir.as_deref())
    }

    fn platform(&self) -> Platform {
        Platform::Windows
    }

    fn normalize_path(&self, path: &str) -> String {
        // Convert Windows paths to WSL format
        if path.contains('\\') || (path.len() >= 2 && path.chars().nth(1) == Some(':')) {
            windows_to_wsl_path(path)
        } else {
            path.to_string()
        }
    }
}

/// Check if WSL is installed and available
#[allow(dead_code)]
pub async fn check_wsl_installed() -> Result<bool, String> {
    let output = Command::new("wsl")
        .args(["--status"])
        .output()
        .map_err(|e| format!("Failed to check WSL status: {}", e))?;

    // wsl --status returns 0 if WSL is installed
    Ok(output.status.success())
}

/// List available WSL distributions
#[allow(dead_code)]
pub async fn list_wsl_distros() -> Result<Vec<(String, bool, u8, String)>, String> {
    let output = Command::new("wsl")
        .args(["--list", "--verbose"])
        .output()
        .map_err(|e| format!("Failed to list WSL distributions: {}", e))?;

    if !output.status.success() {
        return Err("Failed to list WSL distributions".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut distros = Vec::new();

    // Parse the output (skip header line)
    // Format: "* Ubuntu    Running    2"
    for line in stdout.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Remove null characters (WSL outputs UTF-16)
        let line: String = line.chars().filter(|c| *c != '\0').collect();
        let line = line.trim();

        if line.is_empty() || line.starts_with("NAME") {
            continue;
        }

        let is_default = line.starts_with('*');
        let line = line.trim_start_matches('*').trim();

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            let name = parts[0].to_string();
            let state = parts[1].to_string();
            let version: u8 = parts[2].parse().unwrap_or(2);

            distros.push((name, is_default, version, state));
        }
    }

    Ok(distros)
}

/// Get the default WSL distribution
#[allow(dead_code)]
pub async fn get_default_wsl_distro() -> Result<Option<String>, String> {
    let distros = list_wsl_distros().await?;

    for (name, is_default, _, _) in distros {
        if is_default {
            return Ok(Some(name));
        }
    }

    Ok(None)
}

/// Set the default WSL distribution
#[allow(dead_code)]
pub async fn set_default_wsl_distro(name: &str) -> Result<(), String> {
    let output = Command::new("wsl")
        .args(["--set-default", name])
        .output()
        .map_err(|e| format!("Failed to set default WSL distribution: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to set default WSL distribution: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Start a WSL distribution
#[allow(dead_code)]
pub async fn start_wsl_distro(name: &str) -> Result<(), String> {
    // wsl -d <name> -- echo "started" will start the distro
    let output = Command::new("wsl")
        .args(["-d", name, "--", "echo", "started"])
        .output()
        .map_err(|e| format!("Failed to start WSL distribution: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to start WSL distribution: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Shutdown a WSL distribution
#[allow(dead_code)]
pub async fn shutdown_wsl_distro(name: &str) -> Result<(), String> {
    let output = Command::new("wsl")
        .args(["--terminate", name])
        .output()
        .map_err(|e| format!("Failed to shutdown WSL distribution: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to shutdown WSL distribution: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Set WSL default version to 2
#[allow(dead_code)]
pub async fn set_wsl_default_version_2() -> Result<(), String> {
    let output = Command::new("wsl")
        .args(["--set-default-version", "2"])
        .output()
        .map_err(|e| format!("Failed to set WSL default version: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to set WSL default version: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Convert a distribution to WSL2
#[allow(dead_code)]
pub async fn convert_distro_to_wsl2(name: &str) -> Result<(), String> {
    let output = Command::new("wsl")
        .args(["--set-version", name, "2"])
        .output()
        .map_err(|e| format!("Failed to convert distribution to WSL2: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to convert distribution to WSL2: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Validate that a WSL distribution has required tools (Docker)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WslDistroValidation {
    pub distro_name: String,
    pub docker_available: bool,
    pub docker_version: Option<String>,
    pub errors: Vec<String>,
}

#[allow(dead_code)]
pub async fn validate_wsl_distro_tools(name: &str) -> Result<WslDistroValidation, String> {
    let mut validation = WslDistroValidation {
        distro_name: name.to_string(),
        docker_available: false,
        docker_version: None,
        errors: Vec::new(),
    };

    // Check Docker
    let docker_output = Command::new("wsl")
        .args(["-d", name, "--", "docker", "--version"])
        .output();

    match docker_output {
        Ok(output) if output.status.success() => {
            validation.docker_available = true;
            let version = String::from_utf8_lossy(&output.stdout)
                .trim()
                .replace("Docker version ", "")
                .split(',')
                .next()
                .unwrap_or("")
                .to_string();
            validation.docker_version = Some(version);
        }
        Ok(_) => {
            validation.errors.push("Docker is not installed in this distribution".to_string());
        }
        Err(e) => {
            validation.errors.push(format!("Failed to check Docker: {}", e));
        }
    }

    Ok(validation)
}

/// Get WSL version information
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslVersionInfo {
    pub wsl_version: Option<String>,
    pub kernel_version: Option<String>,
    pub wslg_version: Option<String>,
    pub default_version: u8,
}

#[allow(dead_code)]
pub async fn get_wsl_version_info() -> Result<WslVersionInfo, String> {
    let output = Command::new("wsl")
        .args(["--version"])
        .output()
        .map_err(|e| format!("Failed to get WSL version: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Clean null characters from UTF-16 output
    let stdout: String = stdout.chars().filter(|c| *c != '\0').collect();

    let mut info = WslVersionInfo {
        wsl_version: None,
        kernel_version: None,
        wslg_version: None,
        default_version: 2,
    };

    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("WSL version:") || line.starts_with("WSL Version:") {
            info.wsl_version = Some(line.split(':').nth(1).unwrap_or("").trim().to_string());
        } else if line.starts_with("Kernel version:") || line.starts_with("Kernel Version:") {
            info.kernel_version = Some(line.split(':').nth(1).unwrap_or("").trim().to_string());
        } else if line.starts_with("WSLg version:") || line.starts_with("WSLg Version:") {
            info.wslg_version = Some(line.split(':').nth(1).unwrap_or("").trim().to_string());
        }
    }

    Ok(info)
}
