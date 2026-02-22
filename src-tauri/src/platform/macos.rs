// macOS platform implementation - native command execution

use async_trait::async_trait;
use crate::models::{CommandOutput, Platform};
use crate::platform::{parse_output, CommandExecutor};
use std::path::Path;
use std::process::Command;
use tauri::AppHandle;

/// Common paths where Docker might be installed on macOS
const DOCKER_PATHS: &[&str] = &[
    "/usr/local/bin/docker",           // Intel Mac (Docker Desktop)
    "/opt/homebrew/bin/docker",        // Apple Silicon (Homebrew)
    "/Applications/Docker.app/Contents/Resources/bin/docker", // Docker Desktop bundle
];

/// Common paths where Git might be installed on macOS
const GIT_PATHS: &[&str] = &[
    "/usr/bin/git",                    // Xcode CLI tools
    "/usr/local/bin/git",              // Homebrew Intel
    "/opt/homebrew/bin/git",           // Homebrew Apple Silicon
];

/// macOS command executor - runs commands natively
pub struct MacOSExecutor {
    #[allow(dead_code)]
    app: AppHandle,
    docker_path: Option<String>,
    git_path: Option<String>,
}

impl MacOSExecutor {
    pub fn new(app: AppHandle) -> Self {
        // Find Docker executable
        let docker_path = Self::find_executable(DOCKER_PATHS, "docker");

        // Find Git executable
        let git_path = Self::find_executable(GIT_PATHS, "git");

        Self { app, docker_path, git_path }
    }

    /// Find an executable from a list of known paths, or try to find it via `which`
    fn find_executable(known_paths: &[&str], name: &str) -> Option<String> {
        // First, check known paths
        for path in known_paths {
            if Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        // Try using `which` with a proper PATH
        let shell_path = Self::get_shell_path();
        let output = Command::new("/bin/sh")
            .args(["-c", &format!("export PATH='{}' && which {}", shell_path, name)])
            .output()
            .ok()?;

        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).exists() {
                return Some(path);
            }
        }

        None
    }

    /// Get a comprehensive PATH that includes common binary locations
    fn get_shell_path() -> String {
        // Start with system paths and add common locations
        let base_paths = vec![
            "/usr/local/bin",
            "/opt/homebrew/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
            "/Applications/Docker.app/Contents/Resources/bin",
        ];

        // Also include current PATH if available
        let current_path = std::env::var("PATH").unwrap_or_default();

        if current_path.is_empty() {
            base_paths.join(":")
        } else {
            format!("{}:{}", base_paths.join(":"), current_path)
        }
    }

    /// Get Docker-related environment variables from the user's shell
    fn get_docker_env() -> Vec<(String, String)> {
        let mut env_vars = Vec::new();

        // Try to get DOCKER_HOST from environment or user's shell config
        if let Ok(docker_host) = std::env::var("DOCKER_HOST") {
            env_vars.push(("DOCKER_HOST".to_string(), docker_host));
        }

        if let Ok(docker_cert_path) = std::env::var("DOCKER_CERT_PATH") {
            env_vars.push(("DOCKER_CERT_PATH".to_string(), docker_cert_path));
        }

        if let Ok(docker_tls_verify) = std::env::var("DOCKER_TLS_VERIFY") {
            env_vars.push(("DOCKER_TLS_VERIFY".to_string(), docker_tls_verify));
        }

        env_vars
    }

    /// Execute a command natively with proper PATH
    fn run_native_command(
        &self,
        program: &str,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String> {
        let mut cmd = Command::new(program);
        cmd.args(args);

        // Set a comprehensive PATH
        cmd.env("PATH", Self::get_shell_path());

        // Add Docker-specific environment variables
        for (key, value) in Self::get_docker_env() {
            cmd.env(key, value);
        }

        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to execute command '{}': {}", program, e))?;

        Ok(parse_output(output))
    }

    /// Get the path to the Docker executable
    fn get_docker_path(&self) -> Result<&str, String> {
        self.docker_path
            .as_deref()
            .ok_or_else(|| {
                "Docker not found. Please install Docker Desktop from https://www.docker.com/products/docker-desktop".to_string()
            })
    }

    /// Get the path to the Git executable
    fn get_git_path(&self) -> Result<&str, String> {
        self.git_path
            .as_deref()
            .ok_or_else(|| {
                "Git not found. Please install Xcode CLI tools: xcode-select --install".to_string()
            })
    }
}

#[async_trait]
impl CommandExecutor for MacOSExecutor {
    async fn run_docker(&self, args: &[&str]) -> Result<CommandOutput, String> {
        let docker_path = self.get_docker_path()?;
        self.run_native_command(docker_path, args, None)
    }

    async fn run_docker_compose(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String> {
        let docker_path = self.get_docker_path()?;
        let mut compose_args = vec!["compose"];
        compose_args.extend(args);

        self.run_native_command(docker_path, &compose_args, working_dir)
    }

    async fn run_docker_compose_with_tty(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String> {
        let docker_path = self.get_docker_path()?;
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

        self.run_native_command(docker_path, &compose_args, working_dir)
    }

    async fn run_git(
        &self,
        args: &[&str],
        working_dir: Option<&Path>,
    ) -> Result<CommandOutput, String> {
        let git_path = self.get_git_path()?;
        self.run_native_command(git_path, args, working_dir)
    }

    fn platform(&self) -> Platform {
        Platform::MacOS
    }

    fn normalize_path(&self, path: &str) -> String {
        // macOS paths are already in the correct format
        path.to_string()
    }
}
