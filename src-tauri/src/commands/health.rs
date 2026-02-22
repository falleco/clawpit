// Health check Tauri commands

use crate::commands::AppState;
use crate::models::{
    AlertCounts, AlertSeverity, ContainerState, DependencyStatus, DiskSpaceInfo, ErrorSeverity,
    GatewayStatus, HealthAlert, HealthAlertType, HealthMetrics, HealthMonitoringConfig,
    HealthStatus, HealthSummary, NetworkConnectivityStatus, Platform, PortMapping,
    PrerequisiteError, WslStatus,
};
use crate::platform::{create_executor, detect_platform, CommandExecutor};
use chrono::Utc;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, State};

/// Check all prerequisites and return comprehensive health status
#[tauri::command]
pub async fn check_prerequisites(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<HealthStatus, String> {
    let platform = detect_platform();
    let mut errors: Vec<PrerequisiteError> = Vec::new();

    // Get WSL distro from state
    let wsl_distro = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.wsl_distro.clone()
    };

    // Check WSL on Windows
    let wsl_status = if platform == Platform::Windows {
        Some(check_wsl_status_internal().await)
    } else {
        None
    };

    // Add WSL errors if applicable
    if let Some(ref wsl) = wsl_status {
        if !wsl.installed {
            errors.push(PrerequisiteError {
                code: "WSL_NOT_INSTALLED".to_string(),
                message: "WSL2 is not installed".to_string(),
                suggestion: Some(
                    "Enable WSL2 in Windows Features or run 'wsl --install' in PowerShell"
                        .to_string(),
                ),
                severity: ErrorSeverity::Error,
            });
        } else if !wsl.is_wsl2 {
            errors.push(PrerequisiteError {
                code: "WSL1_DETECTED".to_string(),
                message: "WSL1 detected, WSL2 is required".to_string(),
                suggestion: Some("Run 'wsl --set-default-version 2' to use WSL2".to_string()),
                severity: ErrorSeverity::Error,
            });
        } else if wsl.distributions.is_empty() {
            errors.push(PrerequisiteError {
                code: "NO_WSL_DISTRO".to_string(),
                message: "No WSL distribution installed".to_string(),
                suggestion: Some("Install Ubuntu from Microsoft Store".to_string()),
                severity: ErrorSeverity::Error,
            });
        }
    }

    let executor = create_executor(&app, wsl_distro);

    // Check Docker
    let docker = check_docker_status(&*executor).await;
    if !docker.installed {
        errors.push(PrerequisiteError {
            code: "DOCKER_NOT_INSTALLED".to_string(),
            message: "Docker is not installed".to_string(),
            suggestion: Some(get_docker_install_suggestion(&platform)),
            severity: ErrorSeverity::Error,
        });
    } else if docker.running == Some(false) {
        errors.push(PrerequisiteError {
            code: "DOCKER_NOT_RUNNING".to_string(),
            message: "Docker daemon is not running".to_string(),
            suggestion: Some("Start Docker Desktop or the Docker service".to_string()),
            severity: ErrorSeverity::Error,
        });
    }

    // Check Docker Compose
    let docker_compose = check_docker_compose_status(&*executor).await;
    if !docker_compose.installed {
        errors.push(PrerequisiteError {
            code: "COMPOSE_NOT_INSTALLED".to_string(),
            message: "Docker Compose v2 is not available".to_string(),
            suggestion: Some(
                "Docker Compose v2 comes with Docker Desktop. If using Docker Engine, install the compose plugin."
                    .to_string(),
            ),
            severity: ErrorSeverity::Error,
        });
    }

    // Check Git
    let git = check_git_status(&*executor).await;
    if !git.installed {
        errors.push(PrerequisiteError {
            code: "GIT_NOT_INSTALLED".to_string(),
            message: "Git is not installed".to_string(),
            suggestion: Some(get_git_install_suggestion(&platform)),
            severity: ErrorSeverity::Error,
        });
    }

    // Check internet connectivity
    let network = check_network_connectivity().await;
    if !network.reachable {
        errors.push(PrerequisiteError {
            code: "NETWORK_UNREACHABLE".to_string(),
            message: "Internet connectivity check failed".to_string(),
            suggestion: Some(
                "Check your internet connection, VPN, proxy, or firewall settings.".to_string(),
            ),
            severity: ErrorSeverity::Warning,
        });
    }

    // Check disk space
    let disk_space = check_disk_space().await;
    if !disk_space.sufficient {
        errors.push(PrerequisiteError {
            code: "INSUFFICIENT_DISK".to_string(),
            message: format!(
                "Insufficient disk space: {:.1}GB available, 5GB required",
                disk_space.available_gb
            ),
            suggestion: Some("Free up disk space before proceeding".to_string()),
            severity: ErrorSeverity::Warning,
        });
    }

    let all_passed = errors.iter().all(|e| e.severity != ErrorSeverity::Error);

    Ok(HealthStatus {
        platform,
        wsl_status,
        docker,
        docker_compose,
        git,
        network,
        disk_space,
        all_passed,
        errors,
        timestamp: Utc::now(),
    })
}

/// Check Git installation
async fn check_git_status(executor: &dyn CommandExecutor) -> DependencyStatus {
    let output = executor.run_git(&["--version"], None).await;

    match output {
        Ok(output) if output.success => {
            let version = output
                .stdout
                .trim()
                .replace("git version ", "")
                .to_string();

            DependencyStatus {
                installed: true,
                running: None,
                version: Some(version),
                error: None,
            }
        }
        Ok(output) => DependencyStatus {
            installed: false,
            running: None,
            version: None,
            error: Some(output.stderr),
        },
        Err(e) => DependencyStatus {
            installed: false,
            running: None,
            version: None,
            error: Some(e),
        },
    }
}

/// Check whether network is reachable
async fn check_network_connectivity() -> NetworkConnectivityStatus {
    let endpoint = "https://api.github.com".to_string();
    let started = Instant::now();

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
    {
        Ok(client) => client,
        Err(e) => {
            return NetworkConnectivityStatus {
                reachable: false,
                endpoint,
                latency_ms: None,
                error: Some(format!("Failed to initialize HTTP client: {}", e)),
            };
        }
    };

    let response = client
        .get("https://api.github.com")
        .header("User-Agent", "clawpit-prereq-check/0.1")
        .send()
        .await;

    match response {
        Ok(_) => NetworkConnectivityStatus {
            reachable: true,
            endpoint,
            latency_ms: Some(started.elapsed().as_millis()),
            error: None,
        },
        Err(e) => NetworkConnectivityStatus {
            reachable: false,
            endpoint,
            latency_ms: None,
            error: Some(e.to_string()),
        },
    }
}

/// Check WSL status (Windows only)
async fn check_wsl_status_internal() -> WslStatus {
    #[cfg(target_os = "windows")]
    {
        use crate::platform::windows::{check_wsl_installed, list_wsl_distros};

        let installed = check_wsl_installed().await.unwrap_or(false);

        if !installed {
            return WslStatus {
                installed: false,
                is_wsl2: false,
                distributions: vec![],
                default_distro: None,
                error: Some("WSL is not installed".to_string()),
            };
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
            Err(_) => (vec![], None, false),
        };

        WslStatus {
            installed,
            is_wsl2,
            distributions,
            default_distro,
            error: None,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        WslStatus {
            installed: false,
            is_wsl2: false,
            distributions: vec![],
            default_distro: None,
            error: Some("WSL is only available on Windows".to_string()),
        }
    }
}

/// Check Docker installation and daemon status
async fn check_docker_status(executor: &dyn CommandExecutor) -> DependencyStatus {
    let version_output = executor.run_docker(&["--version"]).await;

    match version_output {
        Ok(output) if output.success => {
            let version = output
                .stdout
                .split(',')
                .next()
                .unwrap_or(&output.stdout)
                .replace("Docker version ", "")
                .trim()
                .to_string();

            // Check if daemon is running
            let info_output = executor.run_docker(&["info"]).await;
            let running = info_output.map(|o| o.success).unwrap_or(false);

            DependencyStatus {
                installed: true,
                running: Some(running),
                version: Some(version),
                error: if running {
                    None
                } else {
                    Some("Docker daemon is not running".to_string())
                },
            }
        }
        Ok(output) => DependencyStatus {
            installed: false,
            running: Some(false),
            version: None,
            error: Some(output.stderr),
        },
        Err(e) => DependencyStatus {
            installed: false,
            running: Some(false),
            version: None,
            error: Some(e),
        },
    }
}

/// Check Docker Compose v2 availability
async fn check_docker_compose_status(executor: &dyn CommandExecutor) -> DependencyStatus {
    let output = executor.run_docker_compose(&["version"], None).await;

    match output {
        Ok(output) if output.success => {
            let version = output
                .stdout
                .lines()
                .next()
                .unwrap_or(&output.stdout)
                .replace("Docker Compose version ", "")
                .trim()
                .to_string();

            DependencyStatus {
                installed: true,
                running: None,
                version: Some(version),
                error: None,
            }
        }
        Ok(output) => DependencyStatus {
            installed: false,
            running: None,
            version: None,
            error: Some(output.stderr),
        },
        Err(e) => DependencyStatus {
            installed: false,
            running: None,
            version: None,
            error: Some(e),
        },
    }
}

/// Check available disk space
async fn check_disk_space() -> DiskSpaceInfo {
    let path = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    let min_required_gb = 5.0;

    #[cfg(unix)]
    {
        use std::ffi::CString;
        use std::mem::MaybeUninit;

        let c_path = CString::new(path.as_str()).unwrap_or_else(|_| CString::new("/").unwrap());

        unsafe {
            let mut stat: MaybeUninit<libc::statvfs> = MaybeUninit::uninit();
            if libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) == 0 {
                let stat = stat.assume_init();
                let block_size = stat.f_frsize as f64;
                let available_bytes = stat.f_bavail as f64 * block_size;
                let total_bytes = stat.f_blocks as f64 * block_size;
                let available_gb = available_bytes / (1024.0 * 1024.0 * 1024.0);
                let total_gb = total_bytes / (1024.0 * 1024.0 * 1024.0);

                return DiskSpaceInfo {
                    available_gb,
                    total_gb,
                    sufficient: available_gb >= min_required_gb,
                    path,
                };
            }
        }

        // Fallback if statvfs fails
        DiskSpaceInfo {
            available_gb: 0.0,
            total_gb: 0.0,
            sufficient: false,
            path,
        }
    }

    #[cfg(not(unix))]
    {
        // On Windows, we'd need to check WSL disk space
        // For now, assume sufficient and let users verify
        DiskSpaceInfo {
            available_gb: 50.0,
            total_gb: 100.0,
            sufficient: true,
            path,
        }
    }
}

/// Get Docker installation suggestion based on platform
fn get_docker_install_suggestion(platform: &Platform) -> String {
    match platform {
        Platform::Windows => {
            "Install Docker Desktop for Windows from https://www.docker.com/products/docker-desktop"
                .to_string()
        }
        Platform::MacOS => {
            "Install Docker Desktop for Mac from https://www.docker.com/products/docker-desktop"
                .to_string()
        }
        Platform::Linux => {
            "Install Docker Engine: https://docs.docker.com/engine/install/".to_string()
        }
    }
}

fn get_git_install_suggestion(platform: &Platform) -> String {
    match platform {
        Platform::Windows => {
            "Install Git in your WSL distribution: sudo apt install git".to_string()
        }
        Platform::MacOS => {
            "Install Git using Xcode CLI tools (xcode-select --install) or Homebrew (brew install git).".to_string()
        }
        Platform::Linux => {
            "Install Git using your package manager (for example: sudo apt install git).".to_string()
        }
    }
}

/// Get gateway container status
#[tauri::command]
pub async fn get_gateway_status(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<GatewayStatus, String> {
    let (wsl_distro, clawpit_dir) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        (state.wsl_distro.clone(), state.clawpit_dir.clone())
    };

    let executor = create_executor(&app, wsl_distro);

    // Get container status via docker compose ps --format json
    let working_dir: Option<&std::path::Path> = clawpit_dir
        .as_ref()
        .map(|d| std::path::Path::new(d.as_str()));
    let output = executor
        .run_docker_compose(&["ps", "--format", "json"], working_dir)
        .await?;

    if !output.success {
        return Ok(GatewayStatus {
            exists: false,
            state: ContainerState::Unknown,
            health: None,
            uptime: None,
            ports: vec![],
            error: Some(output.stderr),
        });
    }

    // Parse JSON output
    let stdout = output.stdout.trim();
    if stdout.is_empty() {
        return Ok(GatewayStatus {
            exists: false,
            state: ContainerState::Stopped,
            health: None,
            uptime: None,
            ports: vec![],
            error: None,
        });
    }

    // Parse container info (docker compose ps --format json returns one JSON per line)
    for line in stdout.lines() {
        if let Ok(container) = serde_json::from_str::<serde_json::Value>(line) {
            let name = container["Name"].as_str().unwrap_or("");
            if name.contains("gateway") || name.contains("openclaw") {
                let state_str = container["State"].as_str().unwrap_or("unknown");
                let state = match state_str.to_lowercase().as_str() {
                    "running" => ContainerState::Running,
                    "exited" | "stopped" => ContainerState::Stopped,
                    "starting" => ContainerState::Starting,
                    "restarting" => ContainerState::Restarting,
                    "paused" => ContainerState::Paused,
                    "dead" => ContainerState::Dead,
                    _ => ContainerState::Unknown,
                };

                let health = container["Health"].as_str().map(|s| s.to_string());

                // Parse ports
                let mut ports = vec![];
                if let Some(ports_str) = container["Ports"].as_str() {
                    // Format: "0.0.0.0:18789->18789/tcp"
                    for port_mapping in ports_str.split(',') {
                        if let Some((host, container_part)) = port_mapping.trim().split_once("->") {
                            if let Some(host_port) = host.split(':').last() {
                                if let Some((container_port, protocol)) =
                                    container_part.split_once('/')
                                {
                                    ports.push(PortMapping {
                                        host_port: host_port.parse().unwrap_or(0),
                                        container_port: container_port.parse().unwrap_or(0),
                                        protocol: protocol.to_string(),
                                    });
                                }
                            }
                        }
                    }
                }

                return Ok(GatewayStatus {
                    exists: true,
                    state,
                    health,
                    uptime: container["RunningFor"].as_str().map(|s| s.to_string()),
                    ports,
                    error: None,
                });
            }
        }
    }

    Ok(GatewayStatus {
        exists: false,
        state: ContainerState::Unknown,
        health: None,
        uptime: None,
        ports: vec![],
        error: None,
    })
}

// =============================================================================
// Health Monitoring Commands (Milestone 4.4)
// =============================================================================

/// Get health metrics for a specific instance
#[tauri::command]
pub async fn get_instance_health_metrics(
    app: AppHandle,
    _state: State<'_, Mutex<AppState>>,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<HealthMetrics, String> {
    let executor = create_executor(&app, wsl_distro);

    // Get instance metadata
    let instance_path = std::path::Path::new(&clawpit_dir)
        .join("instances")
        .join(&instance_id);
    let metadata_path = instance_path.join("instance.json");

    let instance_name = if metadata_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&metadata_path) {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                meta["name"].as_str().unwrap_or(&instance_id).to_string()
            } else {
                instance_id.clone()
            }
        } else {
            instance_id.clone()
        }
    } else {
        instance_id.clone()
    };

    // Get container stats
    let working_dir = instance_path.as_path();
    let project_name = format!("clawpit-{}", instance_id);

    // Get container stats using docker stats
    let stats_output = executor
        .run_docker(&[
            "stats",
            "--no-stream",
            "--format",
            "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}",
            "--filter",
            &format!("label=com.docker.compose.project={}", project_name),
        ])
        .await;

    let mut cpu_percent: Option<f64> = None;
    let mut memory_used_mb: Option<f64> = None;
    let mut memory_limit_mb: Option<f64> = None;
    let mut memory_percent: Option<f64> = None;

    if let Ok(output) = stats_output {
        if output.success && !output.stdout.trim().is_empty() {
            for line in output.stdout.lines() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 4 {
                    // Parse CPU percentage
                    if let Some(cpu_str) = parts.get(1) {
                        cpu_percent = cpu_str
                            .trim_end_matches('%')
                            .trim()
                            .parse::<f64>()
                            .ok();
                    }

                    // Parse memory usage (format: "123MiB / 456MiB")
                    if let Some(mem_str) = parts.get(2) {
                        if let Some((used, limit)) = mem_str.split_once('/') {
                            memory_used_mb = parse_memory_value(used.trim());
                            memory_limit_mb = parse_memory_value(limit.trim());
                        }
                    }

                    // Parse memory percentage
                    if let Some(mem_pct_str) = parts.get(3) {
                        memory_percent = mem_pct_str
                            .trim_end_matches('%')
                            .trim()
                            .parse::<f64>()
                            .ok();
                    }
                }
            }
        }
    }

    // Get container status
    let ps_output = executor
        .run_docker_compose(&["ps", "--format", "json"], Some(working_dir))
        .await;

    let mut container_state = ContainerState::Unknown;
    let mut container_health: Option<String> = None;
    let mut running_containers: u32 = 0;
    let mut total_containers: u32 = 0;

    if let Ok(output) = ps_output {
        if output.success {
            for line in output.stdout.lines() {
                if let Ok(container) = serde_json::from_str::<serde_json::Value>(line) {
                    total_containers += 1;

                    let state_str = container["State"].as_str().unwrap_or("unknown");
                    if state_str.to_lowercase() == "running" {
                        running_containers += 1;
                    }

                    // Get health for gateway container
                    let name = container["Name"].as_str().unwrap_or("");
                    if name.contains("gateway") || name.contains("openclaw") {
                        container_state = match state_str.to_lowercase().as_str() {
                            "running" => ContainerState::Running,
                            "exited" | "stopped" => ContainerState::Stopped,
                            "starting" => ContainerState::Starting,
                            "restarting" => ContainerState::Restarting,
                            "paused" => ContainerState::Paused,
                            "dead" => ContainerState::Dead,
                            _ => ContainerState::Unknown,
                        };
                        container_health = container["Health"].as_str().map(|s| s.to_string());
                    }
                }
            }
        }
    }

    // Check gateway connectivity
    let gateway_reachable = check_gateway_connectivity_internal(&instance_path).await;

    // Get disk space
    let disk_info = check_disk_space().await;

    Ok(HealthMetrics {
        instance_id,
        instance_name,
        cpu_percent,
        memory_used_mb,
        memory_limit_mb,
        memory_percent,
        disk_percent: Some(
            ((disk_info.total_gb - disk_info.available_gb) / disk_info.total_gb) * 100.0,
        ),
        disk_used_gb: Some(disk_info.total_gb - disk_info.available_gb),
        disk_total_gb: Some(disk_info.total_gb),
        gateway_reachable,
        container_health,
        container_state,
        running_containers,
        total_containers,
        timestamp: Utc::now(),
        error: None,
    })
}

/// Parse memory value from Docker stats format (e.g., "123MiB", "1.5GiB")
fn parse_memory_value(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.ends_with("GiB") {
        value
            .trim_end_matches("GiB")
            .trim()
            .parse::<f64>()
            .map(|v| v * 1024.0)
            .ok()
    } else if value.ends_with("MiB") {
        value.trim_end_matches("MiB").trim().parse::<f64>().ok()
    } else if value.ends_with("KiB") {
        value
            .trim_end_matches("KiB")
            .trim()
            .parse::<f64>()
            .map(|v| v / 1024.0)
            .ok()
    } else if value.ends_with("B") {
        value
            .trim_end_matches("B")
            .trim()
            .parse::<f64>()
            .map(|v| v / (1024.0 * 1024.0))
            .ok()
    } else {
        value.parse::<f64>().ok()
    }
}

/// Check if gateway is reachable
async fn check_gateway_connectivity_internal(instance_path: &std::path::Path) -> bool {
    // Try to read the .env file to get the gateway port
    let env_path = instance_path.join(".env");
    let mut port = 18789; // default

    if let Ok(content) = std::fs::read_to_string(&env_path) {
        for line in content.lines() {
            if line.starts_with("GATEWAY_PORT=") || line.starts_with("PORT=") {
                if let Some(port_str) = line.split('=').nth(1) {
                    if let Ok(p) = port_str.trim().parse::<u16>() {
                        port = p;
                    }
                }
            }
        }
    }

    // Try to connect to the gateway health endpoint
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build();

    if let Ok(client) = client {
        let url = format!("http://127.0.0.1:{}/health", port);
        if let Ok(response) = client.get(&url).send().await {
            return response.status().is_success();
        }
    }

    false
}

/// Get health summary for all instances
#[tauri::command]
pub async fn get_health_summary(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    clawpit_dir: String,
    wsl_distro: Option<String>,
) -> Result<HealthSummary, String> {
    let instances_dir = std::path::Path::new(&clawpit_dir).join("instances");

    let mut instances: Vec<HealthMetrics> = Vec::new();
    let mut healthy_instances: u32 = 0;
    let mut degraded_instances: u32 = 0;
    let mut critical_instances: u32 = 0;
    let mut alerts: Vec<HealthAlert> = Vec::new();

    // Get health config for thresholds
    let config = get_health_monitoring_config(state.clone())
        .await
        .unwrap_or_default();

    // Iterate over instance directories
    if instances_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&instances_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let instance_id = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    if instance_id.starts_with('_') || instance_id.starts_with('.') {
                        continue;
                    }

                    // Get metrics for this instance
                    if let Ok(metrics) = get_instance_health_metrics(
                        app.clone(),
                        state.clone(),
                        clawpit_dir.clone(),
                        instance_id.clone(),
                        wsl_distro.clone(),
                    )
                    .await
                    {
                        // Determine instance health status
                        let mut is_healthy = true;
                        let mut is_critical = false;

                        // Check container state
                        if metrics.container_state == ContainerState::Stopped
                            || metrics.container_state == ContainerState::Dead
                        {
                            is_critical = true;
                            is_healthy = false;

                            alerts.push(
                                HealthAlert::new(
                                    Some(instance_id.clone()),
                                    HealthAlertType::ContainerStopped,
                                    AlertSeverity::Critical,
                                    "Container Stopped".to_string(),
                                    format!(
                                        "Instance '{}' container is not running",
                                        metrics.instance_name
                                    ),
                                )
                            );
                        }

                        // Check gateway connectivity
                        if !metrics.gateway_reachable
                            && metrics.container_state == ContainerState::Running
                        {
                            is_healthy = false;
                            alerts.push(
                                HealthAlert::new(
                                    Some(instance_id.clone()),
                                    HealthAlertType::GatewayUnreachable,
                                    AlertSeverity::Warning,
                                    "Gateway Unreachable".to_string(),
                                    format!(
                                        "Cannot connect to gateway for instance '{}'",
                                        metrics.instance_name
                                    ),
                                )
                            );
                        }

                        // Check container health
                        if let Some(ref health) = metrics.container_health {
                            if health.to_lowercase() == "unhealthy" {
                                is_healthy = false;
                                alerts.push(
                                    HealthAlert::new(
                                        Some(instance_id.clone()),
                                        HealthAlertType::ContainerUnhealthy,
                                        AlertSeverity::Warning,
                                        "Container Unhealthy".to_string(),
                                        format!(
                                            "Container health check failing for instance '{}'",
                                            metrics.instance_name
                                        ),
                                    )
                                );
                            }
                        }

                        // Check CPU usage
                        if let Some(cpu) = metrics.cpu_percent {
                            if cpu > config.cpu_threshold_percent {
                                is_healthy = false;
                                alerts.push(
                                    HealthAlert::new(
                                        Some(instance_id.clone()),
                                        HealthAlertType::HighCpuUsage,
                                        AlertSeverity::Warning,
                                        "High CPU Usage".to_string(),
                                        format!(
                                            "CPU usage at {:.1}% for instance '{}'",
                                            cpu, metrics.instance_name
                                        ),
                                    )
                                    .with_values(
                                        format!("{:.1}%", cpu),
                                        format!("{:.1}%", config.cpu_threshold_percent),
                                    ),
                                );
                            }
                        }

                        // Check memory usage
                        if let Some(mem) = metrics.memory_percent {
                            if mem > config.memory_threshold_percent {
                                is_healthy = false;
                                alerts.push(
                                    HealthAlert::new(
                                        Some(instance_id.clone()),
                                        HealthAlertType::HighMemoryUsage,
                                        AlertSeverity::Warning,
                                        "High Memory Usage".to_string(),
                                        format!(
                                            "Memory usage at {:.1}% for instance '{}'",
                                            mem, metrics.instance_name
                                        ),
                                    )
                                    .with_values(
                                        format!("{:.1}%", mem),
                                        format!("{:.1}%", config.memory_threshold_percent),
                                    ),
                                );
                            }
                        }

                        // Check disk usage
                        if let Some(disk) = metrics.disk_percent {
                            if disk > config.disk_threshold_percent {
                                is_healthy = false;
                                alerts.push(
                                    HealthAlert::new(
                                        Some(instance_id.clone()),
                                        HealthAlertType::HighDiskUsage,
                                        AlertSeverity::Warning,
                                        "High Disk Usage".to_string(),
                                        format!("Disk usage at {:.1}%", disk),
                                    )
                                    .with_values(
                                        format!("{:.1}%", disk),
                                        format!("{:.1}%", config.disk_threshold_percent),
                                    ),
                                );
                            }
                        }

                        if is_critical {
                            critical_instances += 1;
                        } else if !is_healthy {
                            degraded_instances += 1;
                        } else {
                            healthy_instances += 1;
                        }

                        instances.push(metrics);
                    }
                }
            }
        }
    }

    // Calculate alert counts
    let mut alert_counts = AlertCounts::default();
    for alert in &alerts {
        match alert.severity {
            AlertSeverity::Info => alert_counts.info += 1,
            AlertSeverity::Warning => alert_counts.warning += 1,
            AlertSeverity::Critical => alert_counts.critical += 1,
        }
    }

    // Determine overall status
    let overall_status = if critical_instances > 0 {
        "critical".to_string()
    } else if degraded_instances > 0 {
        "degraded".to_string()
    } else if healthy_instances > 0 {
        "healthy".to_string()
    } else {
        "unknown".to_string()
    };

    let total_instances = healthy_instances + degraded_instances + critical_instances;

    Ok(HealthSummary {
        overall_status,
        healthy_instances,
        degraded_instances,
        critical_instances,
        total_instances,
        active_alerts: alert_counts,
        instances,
        alerts,
        timestamp: Utc::now(),
    })
}

/// Get health monitoring configuration
#[tauri::command]
pub async fn get_health_monitoring_config(
    state: State<'_, Mutex<AppState>>,
) -> Result<HealthMonitoringConfig, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.health_config.clone())
}

/// Save health monitoring configuration
#[tauri::command]
pub async fn save_health_monitoring_config(
    state: State<'_, Mutex<AppState>>,
    config: HealthMonitoringConfig,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.health_config = config;
    Ok(())
}

/// Check gateway connectivity for an instance
#[tauri::command]
pub async fn check_gateway_connectivity(
    clawpit_dir: String,
    instance_id: String,
) -> Result<bool, String> {
    let instance_path = std::path::Path::new(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    Ok(check_gateway_connectivity_internal(&instance_path).await)
}

/// Trigger manual recovery for an instance
#[tauri::command]
pub async fn trigger_instance_recovery(
    app: AppHandle,
    _state: State<'_, Mutex<AppState>>,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<bool, String> {
    use crate::commands::instance::{restart_instance, start_instance};

    let executor = create_executor(&app, wsl_distro.clone());

    let instance_path = std::path::Path::new(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    // Check current container state
    let ps_output = executor
        .run_docker_compose(&["ps", "--format", "json"], Some(instance_path.as_path()))
        .await;

    let is_running = if let Ok(output) = ps_output {
        output.success
            && output.stdout.lines().any(|line| {
                if let Ok(container) = serde_json::from_str::<serde_json::Value>(line) {
                    container["State"].as_str().unwrap_or("") == "running"
                } else {
                    false
                }
            })
    } else {
        false
    };

    // If running, restart. If stopped, start.
    if is_running {
        restart_instance(app, clawpit_dir, instance_id, wsl_distro)
            .await
            .map(|_| true)
    } else {
        start_instance(app, clawpit_dir, instance_id, wsl_distro)
            .await
            .map(|_| true)
    }
}

/// Send a notification using tauri-plugin-notification
#[tauri::command]
pub async fn send_health_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())?;

    Ok(())
}
