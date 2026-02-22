// Instance and directory management Tauri commands

use crate::models::{
    ClawpitInstance, ClawpitPaths, CoreServicesStatus, DirectoryValidation,
    DiskSpaceResult, EgressLogEntry, InstallConfig, InstanceConfig,
    InstanceMetadata, InstanceStatus, InstanceUpdate, PortCheckResult,
    SuggestedPorts,
};
use crate::platform::detect_platform;
use crate::models::Platform;
use chrono::{TimeZone, Utc};
use rand::Rng;
use serde_json;
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};

/// Base port for instances
const BASE_GATEWAY_PORT: u16 = 18789;
const BASE_BRIDGE_PORT: u16 = 18790;
const PORT_INCREMENT: u16 = 2;

/// Get platform-specific default Clawpit paths
#[tauri::command]
pub fn get_default_clawpit_paths() -> ClawpitPaths {
    let platform = detect_platform();

    match platform {
        Platform::Windows => {
            // For Windows, recommend WSL paths for performance
            // Try to get the actual WSL username
            let wsl_user = std::env::var("USER").unwrap_or_else(|_| "user".to_string());
            let clawpit_dir = format!("/home/{}/.clawpit", wsl_user);

            ClawpitPaths {
                clawpit_dir: clawpit_dir.clone(),
                wsl_path: Some(clawpit_dir.clone()),
                windows_path: Some(format!(
                    "\\\\wsl$\\Ubuntu{}",
                    clawpit_dir.replace('/', "\\")
                )),
            }
        }
        Platform::MacOS | Platform::Linux => {
            // Use standard Unix paths
            let home = std::env::var("HOME").unwrap_or_else(|_| "/home/user".to_string());
            let clawpit_dir = format!("{}/.clawpit", home);

            ClawpitPaths {
                clawpit_dir,
                wsl_path: None,
                windows_path: None,
            }
        }
    }
}

/// State of the Clawpit installation
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClawpitState {
    /// The clawpit directory path
    pub clawpit_dir: String,
    /// Whether the directory exists
    pub exists: bool,
    /// Whether it has a valid config
    pub has_config: bool,
    /// List of instance IDs found
    pub instances: Vec<String>,
    /// Whether any instance is running
    pub has_running_instance: bool,
    /// Name of the running instance (if any)
    pub running_instance_name: Option<String>,
    /// Recommended action for the UI
    pub action: ClawpitAction,
}

/// Recommended action based on clawpit state
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClawpitAction {
    /// No setup exists, start fresh
    NewSetup,
    /// Setup started but not complete, resume wizard
    ResumeSetup,
    /// Instance exists, go to dashboard
    Dashboard,
}

/// Check the state of the Clawpit installation
#[tauri::command]
pub async fn check_clawpit_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, std::sync::Mutex<crate::commands::AppState>>,
) -> Result<ClawpitState, String> {
    let paths = get_default_clawpit_paths();
    let clawpit_dir = PathBuf::from(&paths.clawpit_dir);

    // Check if directory exists
    let exists = clawpit_dir.exists() && clawpit_dir.is_dir();

    // Check for config
    let config_path = clawpit_dir.join("config.json");
    let has_config = config_path.exists();

    // Check for instances
    let instances_dir = clawpit_dir.join("instances");
    let mut instances: Vec<String> = Vec::new();
    let mut has_running_instance = false;
    let mut running_instance_name: Option<String> = None;

    if instances_dir.exists() {
        if let Ok(entries) = fs::read_dir(&instances_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let instance_id = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // Check if this instance has a valid config
                    let instance_config = path.join("instance.json");
                    if instance_config.exists() {
                        instances.push(instance_id.clone());

                        // Check if this instance is running (has docker-compose and containers up)
                        let compose_file = path.join("docker-compose.yml");
                        if compose_file.exists() {
                            // Try to get container status
                            let wsl_distro = {
                                let state = state.lock().map_err(|e| e.to_string())?;
                                state.wsl_distro.clone()
                            };
                            let executor = crate::platform::create_executor(&app, wsl_distro);

                            if let Ok(output) = executor.run_docker_compose(
                                &["ps", "--format", "json"],
                                Some(&path)
                            ).await {
                                if output.success && !output.stdout.trim().is_empty() {
                                    // Check if any container is running
                                    for line in output.stdout.lines() {
                                        if let Ok(container) = serde_json::from_str::<serde_json::Value>(line) {
                                            if container["State"].as_str() == Some("running") {
                                                has_running_instance = true;
                                                // Get instance name from config
                                                if let Ok(config_content) = fs::read_to_string(&instance_config) {
                                                    if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_content) {
                                                        running_instance_name = config["name"].as_str().map(|s| s.to_string());
                                                    }
                                                }
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Determine recommended action
    let action = if !exists || !has_config {
        ClawpitAction::NewSetup
    } else if instances.is_empty() {
        ClawpitAction::ResumeSetup
    } else {
        ClawpitAction::Dashboard
    };

    {
        let mut app_state = state.lock().map_err(|e| e.to_string())?;
        app_state.clawpit_dir = Some(paths.clawpit_dir.clone());
    }

    Ok(ClawpitState {
        clawpit_dir: paths.clawpit_dir,
        exists,
        has_config,
        instances,
        has_running_instance,
        running_instance_name,
        action,
    })
}

/// Validate a Clawpit directory path
#[tauri::command]
pub async fn validate_clawpit_directory(path: String) -> Result<DirectoryValidation, String> {
    let path_buf = PathBuf::from(&path);

    // Check if path is valid
    if path.is_empty() {
        return Ok(DirectoryValidation {
            valid: false,
            error: Some("Path cannot be empty".to_string()),
            disk_space: None,
            exists: false,
            writable: false,
            has_existing_installation: false,
        });
    }

    // Check if parent directory exists (for new installations)
    let parent = path_buf.parent();
    let parent_exists = parent.map(|p| p.exists()).unwrap_or(false);

    // Check if path exists
    let exists = path_buf.exists();
    let is_dir = path_buf.is_dir();

    // Check for existing installation
    let has_existing = exists && path_buf.join("config.json").exists();

    // Check if writable
    let writable = if exists && is_dir {
        check_writable(&path_buf)
    } else if parent_exists {
        // Check if we can write to parent
        check_writable(parent.unwrap())
    } else {
        false
    };

    // Get disk space
    let disk_space = get_disk_space(&path_buf).ok();

    // Validate
    let (valid, error) = if !parent_exists && !exists {
        (false, Some("Parent directory does not exist".to_string()))
    } else if exists && !is_dir {
        (false, Some("Path exists but is not a directory".to_string()))
    } else if !writable {
        (false, Some("Directory is not writable".to_string()))
    } else if let Some(ref ds) = disk_space {
        if ds.available < 5.0 {
            (false, Some(format!("Insufficient disk space: {:.1} GB available, 5 GB required", ds.available)))
        } else {
            (true, None)
        }
    } else {
        (true, None)
    };

    Ok(DirectoryValidation {
        valid,
        error,
        disk_space,
        exists,
        writable,
        has_existing_installation: has_existing,
    })
}

/// Create the Clawpit directory structure
#[tauri::command]
pub async fn create_clawpit_structure(clawpit_dir: String) -> Result<(), String> {
    let base = PathBuf::from(&clawpit_dir);

    // Create main directories
    let dirs = [
        base.clone(),
        base.join("instances"),
        base.join("logs"),
    ];

    for dir in &dirs {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dir, e))?;
    }

    // Create default config.json if it doesn't exist
    let config_path = base.join("config.json");
    if !config_path.exists() {
        let default_config = serde_json::json!({
            "version": "1.0.0",
            "createdAt": Utc::now().to_rfc3339(),
        });

        let content = serde_json::to_string_pretty(&default_config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        fs::write(&config_path, content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;
    }

    // Create default settings.json if it doesn't exist
    let settings_path = base.join("settings.json");
    if !settings_path.exists() {
        let default_settings = serde_json::json!({
            "theme": "dark",
            "language": "en",
            "startOnBoot": false,
            "minimizeToTray": true,
            "notificationsEnabled": true,
        });

        let content = serde_json::to_string_pretty(&default_settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        fs::write(&settings_path, content)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;
    }

    Ok(())
}

/// Create a new instance
#[tauri::command]
pub async fn create_instance(
    clawpit_dir: String,
    config: InstanceConfig,
) -> Result<ClawpitInstance, String> {
    // Validate instance ID
    validate_instance_id(&config.id)?;

    let instances_dir = PathBuf::from(&clawpit_dir).join("instances");
    let instance_dir = instances_dir.join(&config.id);

    // Check if instance already exists
    if instance_dir.exists() {
        let instance_config = instance_dir.join("instance.json");
        if instance_config.exists() {
            // Instance has a valid config - it really exists
            return Err(format!("Instance '{}' already exists", config.id));
        } else {
            // Directory exists but no valid config - likely a failed partial installation
            // Clean it up and recreate
            fs::remove_dir_all(&instance_dir)
                .map_err(|e| format!("Failed to clean up incomplete instance: {}", e))?;
        }
    }

    // Create instance directory structure
    fs::create_dir_all(&instance_dir)
        .map_err(|e| format!("Failed to create instance directory: {}", e))?;

    fs::create_dir_all(instance_dir.join("workspace"))
        .map_err(|e| format!("Failed to create workspace directory: {}", e))?;

    // Save instance config
    let config_path = instance_dir.join("instance.json");
    let config_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize instance config: {}", e))?;

    fs::write(&config_path, config_content)
        .map_err(|e| format!("Failed to write instance config: {}", e))?;

    let now = Utc::now().to_rfc3339();

    // Save metadata
    let metadata = InstanceMetadata {
        created_at: now.clone(),
        last_used_at: Some(now.clone()),
    };

    let metadata_path = instance_dir.join("metadata.json");
    let metadata_content = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    fs::write(&metadata_path, metadata_content)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(ClawpitInstance {
        config,
        path: instance_dir.to_string_lossy().to_string(),
        created_at: now.clone(),
        last_used_at: Some(now),
        status: InstanceStatus::Stopped,
    })
}

/// List all instances
#[tauri::command]
pub async fn list_instances(
    app: tauri::AppHandle,
    clawpit_dir: String,
    wsl_distro: Option<String>,
) -> Result<Vec<ClawpitInstance>, String> {
    use crate::platform::create_executor;

    let instances_dir = PathBuf::from(&clawpit_dir).join("instances");

    if !instances_dir.exists() {
        return Ok(vec![]);
    }

    // Create executor for checking Docker status
    let executor = create_executor(&app, wsl_distro);

    let mut instances = Vec::new();

    let entries = fs::read_dir(&instances_dir)
        .map_err(|e| format!("Failed to read instances directory: {}", e))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let config_path = path.join("instance.json");
        if !config_path.exists() {
            continue;
        }

        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read instance config: {}", e))?;

        let config: InstanceConfig = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse instance config: {}", e))?;

        // Read metadata
        let metadata = read_instance_metadata(&path);

        // Get actual status from Docker
        let status = get_instance_docker_status(executor.as_ref(), &path).await;

        instances.push(ClawpitInstance {
            config,
            path: path.to_string_lossy().to_string(),
            created_at: metadata.created_at,
            last_used_at: metadata.last_used_at,
            status,
        });
    }

    // Sort by creation date (newest first)
    instances.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(instances)
}

/// Helper to get Docker container status for an instance
async fn get_instance_docker_status(
    executor: &dyn crate::platform::CommandExecutor,
    instance_dir: &Path,
) -> InstanceStatus {
    // Check if docker-compose.yml exists
    let compose_file = instance_dir.join("docker-compose.yml");
    if !compose_file.exists() {
        return InstanceStatus::Stopped;
    }

    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    // Run docker compose ps to check container status
    match executor.run_docker_compose(&["ps", "--format", "json"], Some(working_path)).await {
        Ok(output) => {
            if !output.success {
                return InstanceStatus::Unknown;
            }

            let stdout = output.stdout.trim();
            if stdout.is_empty() || stdout == "[]" {
                return InstanceStatus::Stopped;
            }

            // Parse JSON output - each line is a container
            for line in stdout.lines() {
                if let Ok(container) = serde_json::from_str::<serde_json::Value>(line) {
                    let state = container["State"].as_str().unwrap_or("");
                    match state.to_lowercase().as_str() {
                        "running" => return InstanceStatus::Running,
                        "restarting" => return InstanceStatus::Starting,
                        "paused" => return InstanceStatus::Stopped,
                        "exited" | "dead" => continue, // Check other containers
                        _ => continue,
                    }
                }
            }

            InstanceStatus::Stopped
        }
        Err(_) => InstanceStatus::Unknown,
    }
}

/// Get a specific instance by ID
#[tauri::command]
pub async fn get_instance(
    clawpit_dir: String,
    instance_id: String,
) -> Result<ClawpitInstance, String> {
    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let config_path = instance_dir.join("instance.json");
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read instance config: {}", e))?;

    let config: InstanceConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse instance config: {}", e))?;

    Ok(ClawpitInstance {
        config,
        path: instance_dir.to_string_lossy().to_string(),
        created_at: Utc::now().to_rfc3339(),
        last_used_at: None,
        status: InstanceStatus::Unknown,
    })
}

/// Delete an instance
#[tauri::command]
pub async fn delete_instance(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    // Remove gateway/ingress containers and volumes before deleting files.
    // This avoids orphaned containers when a running instance is deleted.
    if instance_dir.join("docker-compose.yml").exists() {
        let executor = create_executor(&app, wsl_distro);
        let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
        let working_path = Path::new(&working_dir);

        let result = executor.run_docker_compose(
            &["down", "-v", "--remove-orphans"],
            Some(working_path),
        ).await;

        match result {
            Ok(output) if output.success => {}
            Ok(output) => {
                let stderr = output.stderr.trim();
                let details = if stderr.is_empty() {
                    "docker compose down failed with unknown error".to_string()
                } else {
                    stderr.to_string()
                };
                return Err(format!(
                    "Failed to remove instance containers before deletion: {}",
                    details
                ));
            }
            Err(e) => {
                return Err(format!(
                    "Failed to remove instance containers before deletion: {}",
                    e
                ));
            }
        }
    }

    fs::remove_dir_all(&instance_dir)
        .map_err(|e| format!("Failed to delete instance directory: {}", e))?;

    Ok(())
}

/// Update an instance configuration
#[tauri::command]
pub async fn update_instance(
    clawpit_dir: String,
    instance_id: String,
    updates: InstanceUpdate,
) -> Result<ClawpitInstance, String> {
    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let config_path = instance_dir.join("instance.json");
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read instance config: {}", e))?;

    let mut config: InstanceConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse instance config: {}", e))?;

    // Apply updates
    if let Some(name) = updates.name {
        config.name = name;
    }
    if let Some(description) = updates.description {
        config.description = description;
    }
    if let Some(gateway_port) = updates.gateway_port {
        config.gateway_port = gateway_port;
    }
    if let Some(bridge_port) = updates.bridge_port {
        config.bridge_port = bridge_port;
    }
    if let Some(bind_mode) = updates.bind_mode {
        config.bind_mode = bind_mode;
    }
    if let Some(auth_token) = updates.auth_token {
        config.auth_token = auth_token;
    }
    if let Some(providers) = updates.providers {
        config.providers = providers;
    }

    // Save updated config
    let config_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize instance config: {}", e))?;

    fs::write(&config_path, config_content)
        .map_err(|e| format!("Failed to write instance config: {}", e))?;

    // Read metadata
    let metadata = read_instance_metadata(&instance_dir);

    Ok(ClawpitInstance {
        config,
        path: instance_dir.to_string_lossy().to_string(),
        created_at: metadata.created_at,
        last_used_at: metadata.last_used_at,
        status: InstanceStatus::Unknown,
    })
}

/// Get suggested ports for a new instance
#[tauri::command]
pub async fn get_next_available_ports(clawpit_dir: String) -> Result<SuggestedPorts, String> {
    let instances_dir = PathBuf::from(&clawpit_dir).join("instances");

    // Collect all used ports
    let mut used_ports: Vec<u16> = Vec::new();

    if instances_dir.exists() {
        if let Ok(entries) = fs::read_dir(&instances_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let config_path = path.join("instance.json");
                    if let Ok(content) = fs::read_to_string(&config_path) {
                        if let Ok(config) = serde_json::from_str::<InstanceConfig>(&content) {
                            used_ports.push(config.gateway_port);
                            used_ports.push(config.bridge_port);
                        }
                    }
                }
            }
        }
    }

    // Find next available ports
    let mut gateway_port = BASE_GATEWAY_PORT;
    let mut bridge_port = BASE_BRIDGE_PORT;

    loop {
        let gateway_in_use = used_ports.contains(&gateway_port) || !is_port_available(gateway_port);
        let bridge_in_use = used_ports.contains(&bridge_port) || !is_port_available(bridge_port);

        if !gateway_in_use && !bridge_in_use {
            break;
        }

        gateway_port += PORT_INCREMENT;
        bridge_port += PORT_INCREMENT;

        // Safety limit
        if gateway_port > 65000 {
            return Err("No available ports found".to_string());
        }
    }

    Ok(SuggestedPorts {
        gateway_port,
        bridge_port,
    })
}

/// Update the last_used_at timestamp for an instance
#[tauri::command]
pub async fn touch_instance(clawpit_dir: String, instance_id: String) -> Result<(), String> {
    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let metadata_path = instance_dir.join("metadata.json");
    let mut metadata = read_instance_metadata(&instance_dir);
    metadata.last_used_at = Some(Utc::now().to_rfc3339());

    let content = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    fs::write(&metadata_path, content)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(())
}

// Helper function to check port availability
fn is_port_available(port: u16) -> bool {
    TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok()
}

// Helper function to read instance metadata
fn read_instance_metadata(instance_dir: &Path) -> InstanceMetadata {
    let metadata_path = instance_dir.join("metadata.json");

    if metadata_path.exists() {
        if let Ok(content) = fs::read_to_string(&metadata_path) {
            if let Ok(metadata) = serde_json::from_str::<InstanceMetadata>(&content) {
                return metadata;
            }
        }
    }

    // Default metadata
    InstanceMetadata {
        created_at: Utc::now().to_rfc3339(),
        last_used_at: None,
    }
}

/// Check if a port is available (basic check)
#[tauri::command]
pub fn check_port_available(port: u16) -> PortCheckResult {
    match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(_) => PortCheckResult {
            available: true,
            error: None,
        },
        Err(e) => PortCheckResult {
            available: false,
            error: Some(format!("Port {} is in use: {}", port, e)),
        },
    }
}

/// Port conflict check result with more details
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortConflictResult {
    pub available: bool,
    pub system_in_use: bool,
    pub conflicting_instance: Option<String>,
    pub suggested_port: Option<u16>,
    pub error: Option<String>,
}

/// Check port availability with cross-instance conflict detection
#[tauri::command]
pub async fn check_port_with_conflicts(
    clawpit_dir: String,
    port: u16,
    current_instance_id: Option<String>,
) -> Result<PortConflictResult, String> {
    // Check if port is in use by the system
    let system_in_use = !is_port_available(port);

    // Check if port conflicts with other instances
    let instances_dir = PathBuf::from(&clawpit_dir).join("instances");
    let mut conflicting_instance: Option<String> = None;

    if instances_dir.exists() {
        if let Ok(entries) = fs::read_dir(&instances_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let instance_id = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // Skip current instance
                    if current_instance_id.as_ref().map(|id| id == &instance_id).unwrap_or(false) {
                        continue;
                    }

                    let config_path = path.join("instance.json");
                    if let Ok(content) = fs::read_to_string(&config_path) {
                        if let Ok(config) = serde_json::from_str::<InstanceConfig>(&content) {
                            if config.gateway_port == port || config.bridge_port == port {
                                conflicting_instance = Some(config.name.clone());
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    let available = !system_in_use && conflicting_instance.is_none();

    // Suggest an alternative port if not available
    let suggested_port = if !available {
        find_next_available_port(&clawpit_dir, port, current_instance_id.as_deref())
    } else {
        None
    };

    let error = if system_in_use {
        Some(format!("Port {} is in use by another application", port))
    } else if let Some(ref instance_name) = conflicting_instance {
        Some(format!("Port {} is used by instance '{}'", port, instance_name))
    } else {
        None
    };

    Ok(PortConflictResult {
        available,
        system_in_use,
        conflicting_instance,
        suggested_port,
        error,
    })
}

/// Find the next available port starting from a given port
fn find_next_available_port(clawpit_dir: &str, start_port: u16, exclude_instance: Option<&str>) -> Option<u16> {
    let instances_dir = PathBuf::from(clawpit_dir).join("instances");

    // Collect all used ports from instances
    let mut used_ports: Vec<u16> = Vec::new();

    if instances_dir.exists() {
        if let Ok(entries) = fs::read_dir(&instances_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let instance_id = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // Skip excluded instance
                    if exclude_instance.map(|id| id == instance_id).unwrap_or(false) {
                        continue;
                    }

                    let config_path = path.join("instance.json");
                    if let Ok(content) = fs::read_to_string(&config_path) {
                        if let Ok(config) = serde_json::from_str::<InstanceConfig>(&content) {
                            used_ports.push(config.gateway_port);
                            used_ports.push(config.bridge_port);
                        }
                    }
                }
            }
        }
    }

    // Find next available port
    let mut port = start_port;
    while port < 65535 {
        if !used_ports.contains(&port) && is_port_available(port) {
            return Some(port);
        }
        port += 1;
    }

    None
}

/// Generate a secure random token
#[tauri::command]
pub fn generate_secure_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

/// Token validation result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenValidationResult {
    pub valid: bool,
    pub strength: String,
    pub score: u8,
    pub issues: Vec<String>,
}

/// Validate a token and return strength assessment
#[tauri::command]
pub fn validate_token(token: String) -> TokenValidationResult {
    let mut issues = Vec::new();
    let len = token.len();

    // Check length
    if len == 0 {
        return TokenValidationResult {
            valid: false,
            strength: "None".to_string(),
            score: 0,
            issues: vec!["Token is empty".to_string()],
        };
    }

    if len < 8 {
        issues.push("Token is too short (minimum 8 characters)".to_string());
    } else if len < 16 {
        issues.push("Token should be at least 16 characters for adequate security".to_string());
    }

    // Check for common weak patterns
    if token.chars().all(|c| c.is_ascii_digit()) {
        issues.push("Token contains only digits - consider using letters too".to_string());
    }

    if token.chars().all(|c| c.is_ascii_lowercase()) {
        issues.push("Token contains only lowercase letters - consider using mixed case or numbers".to_string());
    }

    // Check for sequential characters
    let chars: Vec<char> = token.chars().collect();
    let mut sequential_count = 0;
    for i in 0..chars.len().saturating_sub(2) {
        if chars[i] as u32 + 1 == chars[i + 1] as u32
            && chars[i + 1] as u32 + 1 == chars[i + 2] as u32
        {
            sequential_count += 1;
        }
    }
    if sequential_count > 2 {
        issues.push("Token contains sequential character patterns".to_string());
    }

    // Check for repeated characters
    let mut repeat_count = 0;
    for i in 0..chars.len().saturating_sub(2) {
        if chars[i] == chars[i + 1] && chars[i + 1] == chars[i + 2] {
            repeat_count += 1;
        }
    }
    if repeat_count > 1 {
        issues.push("Token contains repeated character patterns".to_string());
    }

    // Calculate score
    let score = if len < 8 {
        0
    } else if len < 16 {
        1
    } else if len < 32 {
        if issues.is_empty() { 2 } else { 1 }
    } else if len < 64 {
        if issues.is_empty() { 3 } else { 2 }
    } else {
        if issues.is_empty() { 4 } else { 3 }
    };

    let strength = match score {
        0 => "Very Weak",
        1 => "Weak",
        2 => "Fair",
        3 => "Good",
        4 => "Strong",
        _ => "Unknown",
    };

    TokenValidationResult {
        valid: len >= 8 && issues.len() < 3,
        strength: strength.to_string(),
        score,
        issues,
    }
}

/// Installation progress event for frontend
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallProgressEvent {
    step: String,
    progress: u8,
    message: String,
    is_error: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<String>,
}

/// Run the installation process
#[tauri::command]
pub async fn run_installation(
    app: tauri::AppHandle,
    config: InstallConfig,
) -> Result<(), String> {
    use crate::platform::create_executor;
    use tauri::Emitter;

    // Create platform executor
    let executor = create_executor(&app, config.wsl_distro.clone());
    let instance_dir = PathBuf::from(&config.clawpit_dir)
        .join("instances")
        .join(&config.instance.id);

    // Helper to emit progress events
    let emit_progress = |step: &str, progress: u8, message: &str, details: Option<&str>| {
        let _ = app.emit("install-progress", InstallProgressEvent {
            step: step.to_string(),
            progress,
            message: message.to_string(),
            is_error: false,
            details: details.map(|s| s.to_string()),
        });
    };

    let emit_error = |step: &str, message: &str, details: Option<&str>| {
        let _ = app.emit("install-progress", InstallProgressEvent {
            step: step.to_string(),
            progress: 0,
            message: message.to_string(),
            is_error: true,
            details: details.map(|s| s.to_string()),
        });
    };

    // Step 1: Create directory structure
    emit_progress("Creating directories", 5, "Creating Clawpit directory structure...", None);

    if let Err(e) = create_clawpit_structure(config.clawpit_dir.clone()).await {
        emit_error("Creating directories", &e, None);
        return Err(e);
    }

    emit_progress("Creating directories", 8, "Directory structure created", None);

    // Step 1.5: Ensure core services are running (egress proxy, networks)
    emit_progress("Starting core services", 10, "Starting security proxy and networks...", None);

    if let Err(e) = ensure_core_services(app.clone(), config.clawpit_dir.clone(), config.wsl_distro.clone()).await {
        emit_error("Starting core services", &format!("Failed to start core services: {}", e), Some("The egress proxy and internal networks are required for secure operation"));
        return Err(e);
    }

    emit_progress("Starting core services", 15, "Core services running", None);

    // Step 2: Create instance
    emit_progress("Generating configuration", 15, "Creating instance configuration...", None);

    let instance = match create_instance(config.clawpit_dir.clone(), config.instance.clone()).await {
        Ok(inst) => inst,
        Err(e) => {
            emit_error("Generating configuration", &e, None);
            return Err(e);
        }
    };

    emit_progress("Generating configuration", 20, "Instance configuration created", None);

    // Step 3: Generate Docker Compose files
    emit_progress("Generating configuration", 25, "Generating Docker Compose files...", None);

    if let Err(e) = generate_docker_compose(&instance, &config).await {
        emit_error("Generating configuration", &e, None);
        return Err(e);
    }

    emit_progress("Generating configuration", 30, "Docker Compose files generated", None);

    // Check if we should skip Docker operations (dev/test mode)
    if config.skip_docker {
        emit_progress("Pulling Docker image", 40, "Docker operations skipped (development mode)", None);
        emit_progress("Running setup", 60, "Docker operations skipped (development mode)", None);
        emit_progress("Configuring OpenClaw", 80, "Docker operations skipped (development mode)", None);
        emit_progress("Starting gateway", 95, "Docker operations skipped (development mode)", None);
    } else {
        let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
        let working_path = Path::new(&working_dir);

        // Step 4: Pull Docker image
        emit_progress("Pulling Docker image", 35, "Pulling OpenClaw Docker image...", Some("This may take a few minutes on first run"));

        let pull_result = executor.run_docker_compose(&["pull"], Some(working_path)).await;

        match pull_result {
            Ok(output) => {
                if output.success {
                    emit_progress("Pulling Docker image", 45, "Docker image pulled successfully", None);
                } else {
                    let stderr = output.stderr.trim();
                    emit_progress("Pulling Docker image", 45, "Image pull completed", Some(stderr));
                }
            }
            Err(e) => {
                // Don't fail on pull error - image might already exist locally
                emit_progress("Pulling Docker image", 45, "Using local image", Some(&e));
            }
        }

        // Step 5: Run OpenClaw setup inside the container
        emit_progress("Running setup", 50, "Running OpenClaw setup...", Some("Initializing configuration structure"));

        // Run: docker compose run --rm openclaw-cli setup --workspace /home/node/.openclaw/workspace
        let setup_result = executor.run_docker_compose(
            &["run", "--rm", "openclaw-cli", "setup", "--workspace", "/home/node/.openclaw/workspace"],
            Some(working_path)
        ).await;

        match setup_result {
            Ok(output) => {
                if output.success {
                    emit_progress("Running setup", 60, "OpenClaw setup completed", None);
                } else {
                    let stderr = output.stderr.trim();
                    // Setup might fail if already configured, that's OK
                    if stderr.contains("already") || stderr.contains("exists") {
                        emit_progress("Running setup", 60, "Configuration already exists", Some(stderr));
                    } else {
                        emit_error("Running setup", "OpenClaw setup failed", Some(stderr));
                        return Err(format!("OpenClaw setup failed: {}", stderr));
                    }
                }
            }
            Err(e) => {
                emit_error("Running setup", "Failed to run OpenClaw setup", Some(&e));
                return Err(format!("Failed to run OpenClaw setup: {}", e));
            }
        }

        // Step 6: Configure OpenClaw with user settings
        emit_progress("Configuring OpenClaw", 65, "Applying user configuration...", None);

        // The config file should be at data/openclaw.json (mapped to /home/node/.openclaw/openclaw.json in container)
        let config_file = instance_dir.join("data").join("openclaw.json");

        if let Err(e) = apply_openclaw_config(&config_file, &instance, &config).await {
            emit_progress("Configuring OpenClaw", 70, "Could not update config file", Some(&e));
            // Don't fail - the setup might have created config elsewhere or user can configure manually
        } else {
            emit_progress("Configuring OpenClaw", 72, "Configuration applied", None);
        }

        // Step 7: Validate and fix configuration with openclaw doctor
        emit_progress("Configuring OpenClaw", 74, "Validating configuration...", None);

        let doctor_result = executor.run_docker_compose(
            &["run", "--rm", "openclaw-cli", "doctor", "--fix"],
            Some(working_path)
        ).await;

        match doctor_result {
            Ok(output) => {
                if output.success {
                    emit_progress("Configuring OpenClaw", 78, "Configuration validated", None);
                } else {
                    // Doctor might report issues but still work
                    let stderr = output.stderr.trim();
                    if !stderr.is_empty() {
                        emit_progress("Configuring OpenClaw", 78, "Configuration validated with warnings", Some(stderr));
                    } else {
                        emit_progress("Configuring OpenClaw", 78, "Configuration validated", None);
                    }
                }
            }
            Err(e) => {
                // Don't fail on doctor error - gateway might still start
                emit_progress("Configuring OpenClaw", 78, "Could not validate configuration", Some(&e));
            }
        }

        // Step 8: Start gateway and ingress services together
        emit_progress("Starting services", 82, "Starting OpenClaw gateway and ingress services...", None);

        let up_result = executor.run_docker_compose(
            &["up", "-d", "openclaw-gateway", "openclaw-ingress"],
            Some(working_path),
        ).await;

        match up_result {
            Ok(output) => {
                if output.success {
                    emit_progress("Starting services", 90, "Gateway and ingress services started", None);
                } else {
                    let error_msg = if !output.stderr.is_empty() {
                        output.stderr.clone()
                    } else {
                        "Failed to start gateway and ingress services".to_string()
                    };
                    emit_error("Starting services", "Failed to start gateway and ingress", Some(&error_msg));
                    return Err(format!("Failed to start gateway and ingress: {}", error_msg));
                }
            }
            Err(e) => {
                emit_error("Starting services", "Failed to start gateway and ingress services", Some(&e));
                return Err(format!("Failed to start gateway and ingress services: {}", e));
            }
        }

        // Step 9: Verify service is running
        emit_progress("Verifying installation", 92, "Verifying gateway and ingress are running...", None);

        // Give the container a moment to start
        tokio::time::sleep(tokio::time::Duration::from_millis(3000)).await;

        let ps_result = executor.run_docker_compose(&["ps", "--format", "json"], Some(working_path)).await;

        match ps_result {
            Ok(output) => {
                if output.success {
                    let stdout = output.stdout.trim();
                    if stdout.is_empty() || stdout == "[]" {
                        emit_progress("Verifying installation", 95, "Waiting for container to start...", None);
                        tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
                    } else {
                        let mut gateway_running = false;
                        let mut ingress_running = false;

                        for line in stdout.lines() {
                            if let Ok(container) = serde_json::from_str::<serde_json::Value>(line) {
                                let service = container["Service"].as_str().unwrap_or("");
                                let name = container["Name"].as_str().unwrap_or("");
                                let state = container["State"].as_str().unwrap_or("").to_lowercase();
                                let is_running = state == "running";

                                if service == "openclaw-gateway" || (name.contains("-gateway") && !name.contains("-ingress")) {
                                    gateway_running = is_running;
                                } else if service == "openclaw-ingress" || name.contains("-ingress") {
                                    ingress_running = is_running;
                                }
                            }
                        }

                        if gateway_running && ingress_running {
                            emit_progress("Verifying installation", 98, "Gateway and ingress containers are running", None);
                        } else {
                            emit_progress("Verifying installation", 95, "Waiting for gateway and ingress to be ready...", None);
                        }
                    }
                } else {
                    emit_progress("Verifying installation", 95, "Could not verify container status", Some(&output.stderr));
                }
            }
            Err(e) => {
                emit_progress("Verifying installation", 95, "Could not verify container status", Some(&e));
            }
        }
    }

    // Step 7: Update instance timestamp
    let _ = touch_instance(config.clawpit_dir.clone(), config.instance.id.clone()).await;

    emit_progress("Verifying installation", 100, "Installation completed successfully!", None);

    Ok(())
}

/// Ensure core services (egress proxy, networks) are running
/// This must be called before starting any instance
#[tauri::command]
pub async fn ensure_core_services(
    app: tauri::AppHandle,
    clawpit_dir: String,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    use crate::platform::create_executor;

    let core_dir = PathBuf::from(&clawpit_dir).join("core");

    // Create core directory if it doesn't exist
    if !core_dir.exists() {
        fs::create_dir_all(&core_dir)
            .map_err(|e| format!("Failed to create core directory: {}", e))?;
    }

    // Copy core files from bundled resources if they don't exist
    let compose_file = core_dir.join("docker-compose.yml");
    if !compose_file.exists() {
        // Copy docker-compose.yml
        let compose_content = include_str!("../../resources/core/docker-compose.yml");
        fs::write(&compose_file, compose_content)
            .map_err(|e| format!("Failed to write core docker-compose.yml: {}", e))?;

        // Create egress directory and files
        let egress_dir = core_dir.join("egress");
        fs::create_dir_all(&egress_dir)
            .map_err(|e| format!("Failed to create egress directory: {}", e))?;

        let allowed_domains = include_str!("../../resources/core/egress/allowed-domains.txt");
        fs::write(egress_dir.join("allowed-domains.txt"), allowed_domains)
            .map_err(|e| format!("Failed to write allowed-domains.txt: {}", e))?;

        let allowed_ips = include_str!("../../resources/core/egress/allowed-ips.txt");
        fs::write(egress_dir.join("allowed-ips.txt"), allowed_ips)
            .map_err(|e| format!("Failed to write allowed-ips.txt: {}", e))?;
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&core_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    // Check if core services are already running
    let ps_result = executor.run_docker_compose(&["ps", "-q"], Some(working_path)).await;

    if let Ok(result) = ps_result {
        if result.success && !result.stdout.trim().is_empty() {
            // Core services are already running
            return Ok(());
        }
    }

    // Start core services with project name "core" to ensure predictable network names
    let result = executor.run_docker_compose(
        &["-p", "core", "up", "-d"],
        Some(working_path)
    ).await?;

    if result.success {
        Ok(())
    } else {
        Err(format!("Failed to start core services: {}", result.stderr))
    }
}

/// Get core services status
#[tauri::command]
pub async fn get_core_services_status(
    app: tauri::AppHandle,
    clawpit_dir: String,
    wsl_distro: Option<String>,
) -> Result<CoreServicesStatus, String> {
    use crate::platform::create_executor;

    let core_dir = PathBuf::from(&clawpit_dir).join("core");

    if !core_dir.exists() {
        return Ok(CoreServicesStatus {
            installed: false,
            running: false,
            egress_healthy: false,
            networks_created: false,
        });
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&core_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    // Check if containers are running
    let ps_result = executor.run_docker_compose(
        &["-p", "core", "ps", "--format", "json"],
        Some(working_path)
    ).await;

    let running = if let Ok(result) = &ps_result {
        result.success && !result.stdout.trim().is_empty()
    } else {
        false
    };

    // Check if egress is healthy by looking at container status
    let egress_healthy = if let Ok(result) = &ps_result {
        result.stdout.contains("clawpit-egress") && result.stdout.contains("running")
    } else {
        false
    };

    // Check if networks exist
    let network_result = executor.run_docker(&["network", "ls", "--format", "{{.Name}}"]).await;
    let networks_created = if let Ok(result) = network_result {
        result.stdout.contains("core_clawpit-internal") &&
        result.stdout.contains("core_clawpit-egress")
    } else {
        false
    };

    Ok(CoreServicesStatus {
        installed: true,
        running,
        egress_healthy,
        networks_created,
    })
}

/// Get parsed egress proxy logs from core services
#[tauri::command]
pub async fn get_egress_logs(
    app: tauri::AppHandle,
    clawpit_dir: String,
    wsl_distro: Option<String>,
    lines: Option<u32>,
) -> Result<Vec<EgressLogEntry>, String> {
    use crate::platform::create_executor;

    let core_dir = PathBuf::from(&clawpit_dir).join("core");

    if !core_dir.exists() {
        return Ok(Vec::new());
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&core_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);
    let tail_arg = lines.unwrap_or(500).to_string();

    let result = executor.run_docker_compose(
        &[
            "-p",
            "core",
            "logs",
            "--tail",
            &tail_arg,
            "--no-color",
            "clawpit-egress",
        ],
        Some(working_path),
    ).await?;

    if !result.success {
        return Err(format!("Failed to read egress logs: {}", result.stderr));
    }

    let mut entries = parse_egress_logs(&result.stdout);
    // Docker logs returns oldest first; UI needs latest first.
    entries.reverse();

    Ok(entries)
}

fn parse_egress_logs(raw: &str) -> Vec<EgressLogEntry> {
    raw.lines()
        .filter_map(parse_egress_log_line)
        .collect()
}

fn parse_egress_log_line(raw_line: &str) -> Option<EgressLogEntry> {
    let mut line = raw_line.trim();
    if line.is_empty() {
        return None;
    }

    // Docker compose logs format usually prefixes with "<service> | ".
    if let Some((prefix, rest)) = line.split_once('|') {
        if prefix.contains("egress") {
            line = rest.trim();
        }
    }

    if line.is_empty() {
        return None;
    }

    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }

    // Squid access logs: "<epoch> <duration_ms> <client_ip> <status> ... <method> <url_or_host> ..."
    let ip = parts.get(2).copied().unwrap_or("-").to_string();
    let status = find_proxy_status(&parts).unwrap_or("-").to_string();
    if status == "-" {
        return None;
    }

    let method_index = parts.iter().position(|part| {
        matches!(
            *part,
            "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" | "CONNECT"
        )
    });

    let endpoint = method_index
        .and_then(|idx| parts.get(idx + 1))
        .copied()
        .or_else(|| parts.last().copied())
        .unwrap_or("-");

    Some(EgressLogEntry {
        time: normalize_egress_timestamp(parts[0]),
        domain: extract_domain(endpoint),
        status: status.clone(),
        decision: decision_from_status(&status).to_string(),
        ip,
    })
}

fn find_proxy_status<'a>(parts: &'a [&'a str]) -> Option<&'a str> {
    parts.iter().copied().find(|part| {
        let upper = part.to_ascii_uppercase();
        upper.contains('/')
            && (upper.starts_with("TCP_")
                || upper.starts_with("UDP_")
                || upper.starts_with("ERR_")
                || upper.starts_with("NONE/"))
    })
}

fn normalize_egress_timestamp(raw: &str) -> String {
    if let Ok(epoch) = raw.parse::<f64>() {
        let seconds = epoch.floor() as i64;
        let nanos = ((epoch - seconds as f64) * 1_000_000_000_f64).round() as u32;
        if let chrono::LocalResult::Single(dt) = Utc.timestamp_opt(seconds, nanos.min(999_999_999))
        {
            return dt.to_rfc3339();
        }
    }

    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
        return dt.with_timezone(&Utc).to_rfc3339();
    }

    raw.to_string()
}

fn extract_domain(value: &str) -> String {
    if value.is_empty() || value == "-" {
        return "-".to_string();
    }

    let trimmed = value.trim_matches(|c| c == '"' || c == '\'');
    let without_scheme = if let Some(idx) = trimmed.find("://") {
        &trimmed[(idx + 3)..]
    } else {
        trimmed
    };
    let without_auth = without_scheme.rsplit('@').next().unwrap_or(without_scheme);
    let host_path = without_auth.split('/').next().unwrap_or(without_auth);
    let host_only = host_path.split('?').next().unwrap_or(host_path);

    if host_only.starts_with('[') {
        let ipv6 = host_only
            .trim_start_matches('[')
            .split(']')
            .next()
            .unwrap_or("");
        if ipv6.is_empty() {
            "-".to_string()
        } else {
            ipv6.to_string()
        }
    } else {
        let host = host_only.split(':').next().unwrap_or("");
        if host.is_empty() {
            "-".to_string()
        } else {
            host.to_string()
        }
    }
}

fn decision_from_status(status: &str) -> &'static str {
    let upper = status.to_ascii_uppercase();

    if upper.contains("DENIED") || upper.contains("BLOCKED") {
        return "refused";
    }

    if let Some((_, code_raw)) = upper.split_once('/') {
        let code: String = code_raw
            .chars()
            .take_while(|ch| ch.is_ascii_digit())
            .collect();

        if code.starts_with('2') || code.starts_with('3') {
            return "approved";
        }

        if !code.is_empty() {
            return "refused";
        }
    }

    "refused"
}

/// Stop core services (only when no instances are running)
#[tauri::command]
pub async fn stop_core_services(
    app: tauri::AppHandle,
    clawpit_dir: String,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    use crate::platform::create_executor;

    let core_dir = PathBuf::from(&clawpit_dir).join("core");

    if !core_dir.exists() {
        return Ok(());
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&core_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let result = executor.run_docker_compose(
        &["-p", "core", "down"],
        Some(working_path)
    ).await?;

    if result.success {
        Ok(())
    } else {
        Err(format!("Failed to stop core services: {}", result.stderr))
    }
}

/// Start gateway and ingress services for an instance
/// Automatically ensures core services are running first
#[tauri::command]
pub async fn start_instance(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    use crate::platform::create_executor;

    // Ensure core services are running first (egress proxy, networks)
    ensure_core_services(app.clone(), clawpit_dir.clone(), wsl_distro.clone()).await?;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let result = executor.run_docker_compose(
        &["up", "-d", "openclaw-gateway", "openclaw-ingress"],
        Some(working_path),
    ).await?;

    if result.success {
        // Update last used timestamp
        let _ = touch_instance(clawpit_dir, instance_id).await;
        Ok(())
    } else {
        Err(format!("Failed to start instance: {}", result.stderr))
    }
}

/// Stop gateway and ingress services for an instance
#[tauri::command]
pub async fn stop_instance(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let result = executor.run_docker_compose(
        &["stop", "openclaw-gateway", "openclaw-ingress"],
        Some(working_path),
    ).await?;

    if result.success {
        Ok(())
    } else {
        Err(format!("Failed to stop instance: {}", result.stderr))
    }
}

/// Restart gateway and ingress services for an instance
#[tauri::command]
pub async fn restart_instance(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let result = executor.run_docker_compose(
        &["restart", "openclaw-gateway", "openclaw-ingress"],
        Some(working_path),
    ).await?;

    if result.success {
        // Update last used timestamp
        let _ = touch_instance(clawpit_dir, instance_id).await;
        Ok(())
    } else {
        Err(format!("Failed to restart instance: {}", result.stderr))
    }
}

/// Get the status of a running instance
#[tauri::command]
pub async fn get_instance_status(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<InstanceStatus, String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let result = executor.run_docker_compose(&["ps", "--format", "json"], Some(working_path)).await;

    match result {
        Ok(output) => {
            if output.success {
                let stdout = output.stdout.trim();
                if stdout.is_empty() || stdout == "[]" {
                    Ok(InstanceStatus::Stopped)
                } else {
                    // Parse JSON to check container state
                    if stdout.contains("\"running\"") || stdout.contains("\"Running\"") {
                        Ok(InstanceStatus::Running)
                    } else if stdout.contains("\"starting\"") || stdout.contains("\"Starting\"") {
                        Ok(InstanceStatus::Starting)
                    } else if stdout.contains("\"exited\"") || stdout.contains("\"Exited\"") {
                        Ok(InstanceStatus::Stopped)
                    } else {
                        Ok(InstanceStatus::Unknown)
                    }
                }
            } else {
                Ok(InstanceStatus::Unknown)
            }
        }
        Err(_) => Ok(InstanceStatus::Unknown),
    }
}

/// Resolve container IPv4 address from docker inspect output.
async fn get_container_ip_address(
    executor: &dyn crate::platform::CommandExecutor,
    container_ref: &str,
) -> Option<String> {
    if container_ref.is_empty() {
        return None;
    }

    let format_template =
        r#"{{range $name, $cfg := .NetworkSettings.Networks}}{{printf "%s=%s\n" $name $cfg.IPAddress}}{{end}}"#;
    let output = executor
        .run_docker(&["inspect", "-f", format_template, container_ref])
        .await
        .ok()?;

    if !output.success {
        return None;
    }

    let mut fallback_ip: Option<String> = None;

    for line in output.stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let (network_name, ip) = line.split_once('=').unwrap_or(("", ""));
        let ip = ip.trim();
        if ip.is_empty() || ip == "<no value>" {
            continue;
        }

        if network_name.contains("clawpit-internal") {
            return Some(ip.to_string());
        }

        if fallback_ip.is_none() {
            fallback_ip = Some(ip.to_string());
        }
    }

    fallback_ip
}

/// Read restart count from docker inspect.
async fn get_container_restart_count(
    executor: &dyn crate::platform::CommandExecutor,
    container_ref: &str,
) -> u32 {
    if container_ref.is_empty() {
        return 0;
    }

    let output = match executor
        .run_docker(&["inspect", "-f", "{{.RestartCount}}", container_ref])
        .await
    {
        Ok(output) => output,
        Err(_) => return 0,
    };

    if !output.success {
        return 0;
    }

    output.stdout.trim().parse::<u32>().unwrap_or(0)
}

/// Get container information for an instance (gateway and ingress)
#[tauri::command]
pub async fn get_instance_containers_info(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<crate::models::InstanceContainersInfo, String> {
    use crate::platform::create_executor;
    use crate::models::{ContainerInfo, InstanceContainersInfo};

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    // Get container info using docker compose ps with JSON format
    let result = executor.run_docker_compose(
        &["ps", "-a", "--format", "json"],
        Some(working_path)
    ).await;

    let mut gateway_info: Option<ContainerInfo> = None;
    let mut ingress_info: Option<ContainerInfo> = None;

    if let Ok(output) = result {
        if output.success {
            // Parse each line as JSON (docker compose outputs one JSON object per line)
            for line in output.stdout.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                if let Ok(container) = serde_json::from_str::<serde_json::Value>(line) {
                    let service = container["Service"].as_str().unwrap_or("");
                    let name = container["Name"].as_str().unwrap_or("").to_string();
                    let full_id = container["ID"].as_str().unwrap_or("").to_string();
                    let state = container["State"].as_str().unwrap_or("unknown").to_lowercase();
                    let health = container["Health"].as_str().unwrap_or("").to_lowercase();
                    let exit_code = container["ExitCode"]
                        .as_i64()
                        .or_else(|| container["ExitCode"].as_str().and_then(|s| s.parse::<i64>().ok()))
                        .unwrap_or(0);

                    // Check for errors: non-zero exit code, unhealthy, or unstable state
                    let has_errors =
                        exit_code != 0 || health == "unhealthy" || state == "restarting" || state == "dead";

                    // Match by compose service first, fallback to container name
                    let is_gateway =
                        service == "openclaw-gateway"
                            || (name.contains("-gateway") && !name.contains("-ingress"));
                    let is_ingress = service == "openclaw-ingress" || name.contains("-ingress");

                    if !is_gateway && !is_ingress {
                        continue;
                    }

                    let container_ref = if full_id.is_empty() {
                        name.as_str()
                    } else {
                        full_id.as_str()
                    };
                    let ip_address = get_container_ip_address(&*executor, container_ref).await;
                    let restart_count = get_container_restart_count(&*executor, container_ref).await;

                    let info = ContainerInfo {
                        id: if full_id.len() > 12 {
                            full_id[..12].to_string()
                        } else {
                            full_id
                        },
                        name: name.clone(),
                        state,
                        has_errors,
                        restart_count,
                        ip_address,
                    };

                    if is_gateway {
                        gateway_info = Some(info);
                    } else if is_ingress {
                        ingress_info = Some(info);
                    }
                }
            }
        }
    }

    Ok(InstanceContainersInfo {
        gateway: gateway_info,
        ingress: ingress_info,
    })
}

/// Get logs from an instance
#[tauri::command]
pub async fn get_instance_logs(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
    lines: Option<u32>,
) -> Result<String, String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let tail_arg = format!("{}", lines.unwrap_or(100));
    let result = executor.run_docker_compose(
        &["logs", "--tail", &tail_arg, "--no-color"],
        Some(working_path)
    ).await?;

    if result.success {
        Ok(result.stdout)
    } else {
        Err(format!("Failed to get logs: {}", result.stderr))
    }
}

/// Log entry structure for structured log output
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    /// Timestamp (ISO 8601 format)
    pub timestamp: Option<String>,
    /// Service/container name
    pub service: String,
    /// Log level (info, warn, error, debug)
    pub level: String,
    /// Log message content
    pub message: String,
    /// Raw line
    pub raw: String,
}

/// Options for fetching logs
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogOptions {
    /// Number of lines to fetch
    pub lines: Option<u32>,
    /// Include timestamps
    pub timestamps: bool,
    /// Filter by service name
    pub service: Option<String>,
    /// Follow logs (for streaming)
    pub follow: bool,
    /// Since timestamp (ISO 8601)
    pub since: Option<String>,
}

impl Default for LogOptions {
    fn default() -> Self {
        Self {
            lines: Some(100),
            timestamps: true,
            service: None,
            follow: false,
            since: None,
        }
    }
}

/// Get logs with enhanced options
#[tauri::command]
pub async fn get_instance_logs_enhanced(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
    options: LogOptions,
) -> Result<Vec<LogEntry>, String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let mut args = vec!["logs"];

    // Add tail option
    let tail_arg;
    if let Some(lines) = options.lines {
        tail_arg = format!("{}", lines);
        args.push("--tail");
        args.push(&tail_arg);
    }

    // Add timestamps if requested
    if options.timestamps {
        args.push("--timestamps");
    }

    // Add since option
    let since_arg;
    if let Some(ref since) = options.since {
        since_arg = since.clone();
        args.push("--since");
        args.push(&since_arg);
    }

    args.push("--no-color");

    // Add service filter if specified
    let service_arg;
    if let Some(ref service) = options.service {
        service_arg = service.clone();
        args.push(&service_arg);
    }

    let result = executor.run_docker_compose(&args, Some(working_path)).await?;

    if !result.success {
        return Err(format!("Failed to get logs: {}", result.stderr));
    }

    // Parse log entries
    let entries = parse_log_entries(&result.stdout);
    Ok(entries)
}

/// Parse raw log output into structured entries
fn parse_log_entries(raw: &str) -> Vec<LogEntry> {
    let mut entries = Vec::new();

    for line in raw.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let entry = parse_log_line(line);
        entries.push(entry);
    }

    entries
}

/// Parse a single log line into a LogEntry
fn parse_log_line(line: &str) -> LogEntry {
    // Docker compose logs format: "service_name  | timestamp message" or "service_name | message"
    // With timestamps: "service_name  | 2024-01-15T10:30:00.123456789Z message"

    let parts: Vec<&str> = line.splitn(2, '|').collect();

    let (service, rest) = if parts.len() == 2 {
        (parts[0].trim().to_string(), parts[1].trim())
    } else {
        ("unknown".to_string(), line)
    };

    // Try to extract timestamp (ISO 8601 format at the start)
    let (timestamp, message) = if rest.len() > 20 && rest.chars().nth(4) == Some('-') {
        // Likely has timestamp
        let space_pos = rest.find(' ').unwrap_or(rest.len());
        if space_pos > 20 {
            (Some(rest[..space_pos].to_string()), rest[space_pos..].trim().to_string())
        } else {
            (None, rest.to_string())
        }
    } else {
        (None, rest.to_string())
    };

    // Detect log level from message content
    let level = detect_log_level(&message);

    LogEntry {
        timestamp,
        service,
        level,
        message: sanitize_log_message(&message),
        raw: line.to_string(),
    }
}

/// Detect log level from message content
fn detect_log_level(message: &str) -> String {
    let lower = message.to_lowercase();

    if lower.contains("error") || lower.contains("fatal") || lower.contains("exception") {
        "error".to_string()
    } else if lower.contains("warn") {
        "warn".to_string()
    } else if lower.contains("debug") || lower.contains("trace") {
        "debug".to_string()
    } else {
        "info".to_string()
    }
}

/// Sanitize log message to remove sensitive information
fn sanitize_log_message(message: &str) -> String {
    // Patterns to sanitize
    let patterns: &[(&str, &str)] = &[
        // API keys and tokens (generic patterns)
        (r#"(?i)(api[_-]?key|token|secret|password|auth)[=:\s]+['"]?[a-zA-Z0-9_.-]+['"]?"#, "[REDACTED]"),
        // Bearer tokens
        (r"(?i)bearer\s+[a-zA-Z0-9_.-]+", "Bearer [REDACTED]"),
        // JWT tokens (three base64 parts separated by dots)
        (r"eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+", "[JWT REDACTED]"),
    ];

    let mut result = message.to_string();

    for (pattern, replacement) in patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            result = re.replace_all(&result, *replacement).to_string();
        }
    }

    result
}

/// Get list of services/containers for an instance
#[tauri::command]
pub async fn get_instance_services(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<Vec<String>, String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    // Get services from docker compose config
    let result = executor.run_docker_compose(
        &["config", "--services"],
        Some(working_path)
    ).await?;

    if !result.success {
        return Err(format!("Failed to get services: {}", result.stderr));
    }

    let services: Vec<String> = result.stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(services)
}

/// System info for log export header
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub platform: String,
    pub app_version: String,
    pub instance_id: String,
    pub instance_name: String,
    pub export_time: String,
    pub docker_version: Option<String>,
}

/// Get system info for log export
#[tauri::command]
pub async fn get_system_info_for_logs(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<SystemInfo, String> {
    use crate::platform::{create_executor, detect_platform};

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    // Get instance name
    let instance_name = if let Ok(content) = fs::read_to_string(instance_dir.join("instance.json")) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
            config["name"].as_str().unwrap_or(&instance_id).to_string()
        } else {
            instance_id.clone()
        }
    } else {
        instance_id.clone()
    };

    // Get Docker version
    let executor = create_executor(&app, wsl_distro);
    let docker_version = if let Ok(output) = executor.run_docker(&["--version"]).await {
        if output.success {
            Some(output.stdout.trim().to_string())
        } else {
            None
        }
    } else {
        None
    };

    Ok(SystemInfo {
        platform: format!("{:?}", detect_platform()),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        instance_id,
        instance_name,
        export_time: Utc::now().to_rfc3339(),
        docker_version,
    })
}

/// Remove an instance's containers and volumes (docker compose down)
#[tauri::command]
pub async fn remove_instance_containers(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
    remove_volumes: bool,
) -> Result<(), String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let args = if remove_volumes {
        vec!["down", "-v"]
    } else {
        vec!["down"]
    };

    let result = executor.run_docker_compose(&args, Some(working_path)).await?;

    if result.success {
        Ok(())
    } else {
        Err(format!("Failed to remove containers: {}", result.stderr))
    }
}

/// Pull updates for an instance (docker compose pull)
#[tauri::command]
pub async fn pull_instance_updates(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<String, String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    let result = executor.run_docker_compose(&["pull"], Some(working_path)).await?;

    if result.success {
        Ok(result.stdout)
    } else {
        Err(format!("Failed to pull updates: {}", result.stderr))
    }
}

/// Extended container details
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerDetails {
    /// Container name
    pub name: String,
    /// Container state (running, stopped, etc.)
    pub state: String,
    /// Health status (healthy, unhealthy, starting, none)
    pub health: Option<String>,
    /// Running for duration (e.g., "2 hours")
    pub running_for: Option<String>,
    /// Ports mapping
    pub ports: Vec<String>,
    /// CPU usage percentage
    pub cpu_percent: Option<f64>,
    /// Memory usage in MB
    pub memory_mb: Option<f64>,
    /// Memory limit in MB
    pub memory_limit_mb: Option<f64>,
}

/// Extended instance status with container details
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtendedInstanceStatus {
    /// Instance ID
    pub instance_id: String,
    /// Instance name
    pub instance_name: String,
    /// Overall status
    pub status: InstanceStatus,
    /// Container details (if any containers exist)
    pub containers: Vec<ContainerDetails>,
    /// Error message if status check failed
    pub error: Option<String>,
}

/// Get extended status for an instance including container details
#[tauri::command]
pub async fn get_instance_extended_status(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    wsl_distro: Option<String>,
) -> Result<ExtendedInstanceStatus, String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    // Read instance config for name
    let config_path = instance_dir.join("instance.json");
    let instance_name = if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
            config["name"].as_str().unwrap_or(&instance_id).to_string()
        } else {
            instance_id.clone()
        }
    } else {
        instance_id.clone()
    };

    let executor = create_executor(&app, wsl_distro.clone());
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    // Get container status with more details
    let ps_result = executor.run_docker_compose(
        &["ps", "--format", "json"],
        Some(working_path)
    ).await;

    let mut containers = Vec::new();
    let mut overall_status = InstanceStatus::Stopped;

    if let Ok(output) = ps_result {
        if output.success && !output.stdout.trim().is_empty() {
            // Parse each line as a JSON container object
            for line in output.stdout.lines() {
                if let Ok(container) = serde_json::from_str::<serde_json::Value>(line) {
                    let name = container["Name"].as_str().unwrap_or("").to_string();
                    let state = container["State"].as_str().unwrap_or("unknown").to_string();
                    let health = container["Health"].as_str().map(|s| s.to_string());
                    let running_for = container["RunningFor"].as_str().map(|s| s.to_string());

                    // Parse ports
                    let ports: Vec<String> = if let Some(ports_str) = container["Ports"].as_str() {
                        ports_str.split(',').map(|s| s.trim().to_string()).collect()
                    } else {
                        Vec::new()
                    };

                    containers.push(ContainerDetails {
                        name,
                        state: state.clone(),
                        health,
                        running_for,
                        ports,
                        cpu_percent: None,
                        memory_mb: None,
                        memory_limit_mb: None,
                    });

                    // Update overall status based on container states
                    match state.to_lowercase().as_str() {
                        "running" => overall_status = InstanceStatus::Running,
                        "restarting" | "starting" => {
                            if overall_status != InstanceStatus::Running {
                                overall_status = InstanceStatus::Starting;
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // Try to get resource usage if containers are running
    if overall_status == InstanceStatus::Running && !containers.is_empty() {
        if let Ok(stats_output) = executor.run_docker_compose(
            &["stats", "--no-stream", "--format", "json"],
            Some(working_path)
        ).await {
            if stats_output.success {
                for line in stats_output.stdout.lines() {
                    if let Ok(stats) = serde_json::from_str::<serde_json::Value>(line) {
                        let name = stats["Name"].as_str().unwrap_or("");

                        // Find matching container and update stats
                        if let Some(container) = containers.iter_mut().find(|c| c.name.contains(name)) {
                            // Parse CPU percent (e.g., "0.50%")
                            if let Some(cpu_str) = stats["CPUPerc"].as_str() {
                                container.cpu_percent = cpu_str.trim_end_matches('%').parse().ok();
                            }

                            // Parse memory (e.g., "50MiB / 1GiB")
                            if let Some(mem_str) = stats["MemUsage"].as_str() {
                                let parts: Vec<&str> = mem_str.split('/').collect();
                                if let Some(usage) = parts.first() {
                                    container.memory_mb = parse_memory_value(usage.trim());
                                }
                                if let Some(limit) = parts.get(1) {
                                    container.memory_limit_mb = parse_memory_value(limit.trim());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(ExtendedInstanceStatus {
        instance_id,
        instance_name,
        status: overall_status,
        containers,
        error: None,
    })
}

/// Parse memory value from docker stats (e.g., "50MiB", "1.5GiB")
fn parse_memory_value(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.ends_with("GiB") || value.ends_with("GB") {
        value.trim_end_matches("GiB").trim_end_matches("GB")
            .parse::<f64>().ok().map(|v| v * 1024.0)
    } else if value.ends_with("MiB") || value.ends_with("MB") {
        value.trim_end_matches("MiB").trim_end_matches("MB")
            .parse::<f64>().ok()
    } else if value.ends_with("KiB") || value.ends_with("KB") {
        value.trim_end_matches("KiB").trim_end_matches("KB")
            .parse::<f64>().ok().map(|v| v / 1024.0)
    } else {
        None
    }
}

/// Get status for all instances
#[tauri::command]
pub async fn get_all_instances_status(
    app: tauri::AppHandle,
    clawpit_dir: String,
    wsl_distro: Option<String>,
) -> Result<Vec<ExtendedInstanceStatus>, String> {
    use crate::platform::create_executor;

    let instances_dir = PathBuf::from(&clawpit_dir).join("instances");

    if !instances_dir.exists() {
        return Ok(vec![]);
    }

    let executor = create_executor(&app, wsl_distro.clone());
    let mut statuses = Vec::new();

    let entries = fs::read_dir(&instances_dir)
        .map_err(|e| format!("Failed to read instances directory: {}", e))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let config_path = path.join("instance.json");
        if !config_path.exists() {
            continue;
        }

        let instance_id = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // Read instance name
        let instance_name = if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                config["name"].as_str().unwrap_or(&instance_id).to_string()
            } else {
                instance_id.clone()
            }
        } else {
            instance_id.clone()
        };

        // Get quick status
        let status = get_instance_docker_status(executor.as_ref(), &path).await;

        statuses.push(ExtendedInstanceStatus {
            instance_id,
            instance_name,
            status,
            containers: Vec::new(), // Skip detailed container info for bulk query
            error: None,
        });
    }

    Ok(statuses)
}

/// Bulk start all instances
#[tauri::command]
pub async fn start_all_instances(
    app: tauri::AppHandle,
    clawpit_dir: String,
    wsl_distro: Option<String>,
) -> Result<Vec<String>, String> {
    let instances_dir = PathBuf::from(&clawpit_dir).join("instances");

    if !instances_dir.exists() {
        return Ok(vec![]);
    }

    let mut started = Vec::new();
    let mut errors = Vec::new();

    let entries = fs::read_dir(&instances_dir)
        .map_err(|e| format!("Failed to read instances directory: {}", e))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let config_path = path.join("instance.json");
        if !config_path.exists() {
            continue;
        }

        let instance_id = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        match start_instance(
            app.clone(),
            clawpit_dir.clone(),
            instance_id.clone(),
            wsl_distro.clone(),
        ).await {
            Ok(_) => started.push(instance_id),
            Err(e) => errors.push(format!("{}: {}", instance_id, e)),
        }
    }

    if !errors.is_empty() {
        Err(format!("Started {}, but some failed: {}", started.len(), errors.join("; ")))
    } else {
        Ok(started)
    }
}

/// Bulk stop all instances
#[tauri::command]
pub async fn stop_all_instances(
    app: tauri::AppHandle,
    clawpit_dir: String,
    wsl_distro: Option<String>,
) -> Result<Vec<String>, String> {
    let instances_dir = PathBuf::from(&clawpit_dir).join("instances");

    if !instances_dir.exists() {
        return Ok(vec![]);
    }

    let mut stopped = Vec::new();
    let mut errors = Vec::new();

    let entries = fs::read_dir(&instances_dir)
        .map_err(|e| format!("Failed to read instances directory: {}", e))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let config_path = path.join("instance.json");
        if !config_path.exists() {
            continue;
        }

        let instance_id = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        match stop_instance(
            app.clone(),
            clawpit_dir.clone(),
            instance_id.clone(),
            wsl_distro.clone(),
        ).await {
            Ok(_) => stopped.push(instance_id),
            Err(e) => errors.push(format!("{}: {}", instance_id, e)),
        }
    }

    if !errors.is_empty() {
        Err(format!("Stopped {}, but some failed: {}", stopped.len(), errors.join("; ")))
    } else {
        Ok(stopped)
    }
}

/// Result of model auth login command
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelAuthResult {
    /// Whether the auth process was initiated successfully
    pub success: bool,
    /// Whether a terminal was opened for interactive auth
    pub terminal_opened: bool,
    /// The OAuth URL to redirect the user to (if extracted)
    pub oauth_url: Option<String>,
    /// Raw output from the command
    pub output: String,
    /// Error message if failed
    pub error: Option<String>,
}

/// Start model authentication flow (e.g., OpenAI OAuth)
/// This opens an external terminal for interactive authentication
#[tauri::command]
pub async fn start_model_auth(
    _app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    provider: String,
    wsl_distro: Option<String>,
) -> Result<ModelAuthResult, String> {
    use crate::platform::detect_platform;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let platform = detect_platform();

    // Build the docker compose command
    let docker_cmd = format!(
        "docker compose run --rm -it openclaw-cli models auth login --provider {}",
        provider
    );

    // Open an external terminal with the command
    let result = match platform {
        Platform::Linux => {
            open_linux_terminal(&instance_dir, &docker_cmd)
        }
        Platform::MacOS => {
            open_macos_terminal(&instance_dir, &docker_cmd)
        }
        Platform::Windows => {
            let distro = wsl_distro.unwrap_or_else(|| "Ubuntu".to_string());
            open_windows_terminal(&instance_dir, &docker_cmd, &distro)
        }
    };

    match result {
        Ok(_) => {
            Ok(ModelAuthResult {
                success: true,
                terminal_opened: true,
                oauth_url: None,
                output: "Terminal opened for authentication. Please complete the process in the terminal window.".to_string(),
                error: None,
            })
        }
        Err(e) => {
            Ok(ModelAuthResult {
                success: false,
                terminal_opened: false,
                oauth_url: None,
                output: String::new(),
                error: Some(format!("Failed to open terminal: {}", e)),
            })
        }
    }
}

/// Open a terminal on Linux with the given command
fn open_linux_terminal(working_dir: &Path, command: &str) -> Result<(), String> {
    use std::process::Command;

    let working_dir_str = working_dir.to_string_lossy().to_string();
    let full_cmd = format!("{}; echo ''; echo 'Press Enter to close...'; read", command);
    let xfce_cmd = format!("bash -c \"{}\"", full_cmd);
    let xterm_cmd = format!("cd '{}' && {}", working_dir_str, full_cmd);

    // Try GNOME Terminal
    if Command::new("which").arg("gnome-terminal").output().map(|o| o.status.success()).unwrap_or(false) {
        return Command::new("gnome-terminal")
            .args(["--working-directory", &working_dir_str, "--", "bash", "-c", &full_cmd])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open gnome-terminal: {}", e));
    }

    // Try Konsole (KDE)
    if Command::new("which").arg("konsole").output().map(|o| o.status.success()).unwrap_or(false) {
        return Command::new("konsole")
            .args(["--workdir", &working_dir_str, "-e", "bash", "-c", &full_cmd])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open konsole: {}", e));
    }

    // Try XFCE Terminal
    if Command::new("which").arg("xfce4-terminal").output().map(|o| o.status.success()).unwrap_or(false) {
        return Command::new("xfce4-terminal")
            .args(["--working-directory", &working_dir_str, "-e", &xfce_cmd])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open xfce4-terminal: {}", e));
    }

    // Try xterm (fallback)
    if Command::new("which").arg("xterm").output().map(|o| o.status.success()).unwrap_or(false) {
        return Command::new("xterm")
            .args(["-e", &xterm_cmd])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open xterm: {}", e));
    }

    Err("No supported terminal emulator found. Please install gnome-terminal, konsole, xfce4-terminal, or xterm.".to_string())
}

/// Open Terminal.app on macOS with the given command
fn open_macos_terminal(working_dir: &Path, command: &str) -> Result<(), String> {
    use std::process::Command;

    let working_dir_str = working_dir.to_string_lossy();

    // Use AppleScript to open Terminal.app with the command
    let script = format!(
        r#"tell application "Terminal"
            activate
            do script "cd '{}' && {}; echo ''; echo 'Press Enter to close...'; read"
        end tell"#,
        working_dir_str, command
    );

    Command::new("osascript")
        .args(["-e", &script])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open Terminal.app: {}", e))
}

/// Open Windows Terminal or cmd with the command running in WSL
fn open_windows_terminal(working_dir: &Path, command: &str, wsl_distro: &str) -> Result<(), String> {
    use std::process::Command;
    use crate::platform::windows_to_wsl_path;

    let working_dir_str = working_dir.to_string_lossy();
    let wsl_path = if working_dir_str.contains('\\') || (working_dir_str.len() >= 2 && working_dir_str.chars().nth(1) == Some(':')) {
        windows_to_wsl_path(&working_dir_str)
    } else {
        working_dir_str.to_string()
    };

    // Build the WSL command
    let wsl_cmd = format!(
        "cd '{}' && {}; echo ''; echo 'Press Enter to close...'; read",
        wsl_path, command
    );

    // Try Windows Terminal first (wt.exe), then fallback to cmd
    let wt_result = Command::new("wt.exe")
        .args([
            "new-tab",
            "--title", "OpenClaw Authentication",
            "wsl.exe", "-d", wsl_distro, "--", "bash", "-c", &wsl_cmd
        ])
        .spawn();

    if wt_result.is_ok() {
        return Ok(());
    }

    // Fallback to cmd with wsl
    Command::new("cmd.exe")
        .args([
            "/C", "start", "cmd.exe", "/K",
            &format!("wsl.exe -d {} -- bash -c \"{}\"", wsl_distro, wsl_cmd)
        ])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open terminal: {}", e))
}

// Helper functions

fn validate_instance_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Instance ID cannot be empty".to_string());
    }

    if id.len() < 3 {
        return Err("Instance ID must be at least 3 characters".to_string());
    }

    if id.len() > 32 {
        return Err("Instance ID must be 32 characters or less".to_string());
    }

    if !id.chars().next().unwrap().is_ascii_lowercase() {
        return Err("Instance ID must start with a lowercase letter".to_string());
    }

    if !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_') {
        return Err("Instance ID can only contain lowercase letters, numbers, hyphens, and underscores".to_string());
    }

    let reserved = ["_template", "_backup"];
    if reserved.contains(&id) {
        return Err("This instance ID is reserved".to_string());
    }

    Ok(())
}

fn check_writable(path: &Path) -> bool {
    let test_file = path.join(".clawpit_write_test");
    match fs::write(&test_file, "test") {
        Ok(_) => {
            let _ = fs::remove_file(&test_file);
            true
        }
        Err(_) => false,
    }
}

#[cfg(unix)]
fn get_disk_space(path: &Path) -> Result<DiskSpaceResult, String> {
    use std::ffi::CString;
    use std::mem::MaybeUninit;

    // Find existing parent directory
    let check_path = if path.exists() {
        path.to_path_buf()
    } else {
        path.ancestors()
            .find(|p| p.exists())
            .unwrap_or(Path::new("/"))
            .to_path_buf()
    };

    let path_str = check_path.to_string_lossy().to_string();
    let c_path = CString::new(path_str)
        .map_err(|_| "Invalid path".to_string())?;

    unsafe {
        let mut stat: MaybeUninit<libc::statvfs> = MaybeUninit::uninit();
        if libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) != 0 {
            return Err("Failed to get filesystem stats".to_string());
        }

        let stat = stat.assume_init();
        let block_size = stat.f_frsize as f64;
        let total_blocks = stat.f_blocks as f64;
        let available_blocks = stat.f_bavail as f64;

        let total_gb = (total_blocks * block_size) / (1024.0 * 1024.0 * 1024.0);
        let available_gb = (available_blocks * block_size) / (1024.0 * 1024.0 * 1024.0);

        Ok(DiskSpaceResult {
            available: available_gb,
            total: total_gb,
        })
    }
}

#[cfg(not(unix))]
fn get_disk_space(_path: &Path) -> Result<DiskSpaceResult, String> {
    // Fallback for non-Unix systems
    Ok(DiskSpaceResult {
        available: 100.0,
        total: 500.0,
    })
}

/// Apply user configuration to OpenClaw openclaw.json
/// File location: ~/.openclaw/openclaw.json (inside container: /home/node/.openclaw/openclaw.json)
///
/// Note: We write a complete config file instead of merging because the setup command
/// creates a JSON5 file (with comments) that serde_json cannot parse.
async fn apply_openclaw_config(
    config_file: &Path,
    instance: &ClawpitInstance,
    install_config: &InstallConfig,
) -> Result<(), String> {
    // Create parent directory if needed
    if let Some(parent) = config_file.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Determine bind mode for gateway
    let bind_mode = match instance.config.bind_mode {
        crate::models::BindMode::Local => "loopback",
        crate::models::BindMode::Lan => "lan",
    };

    // Build the complete OpenClaw config structure
    let mut config = serde_json::Map::new();

    // Gateway configuration
    let mut gateway = serde_json::Map::new();
    gateway.insert("mode".to_string(), serde_json::json!("local"));
    gateway.insert("port".to_string(), serde_json::json!(instance.config.gateway_port));
    gateway.insert("bind".to_string(), serde_json::json!(bind_mode));

    // Gateway auth with token
    if !instance.config.auth_token.is_empty() {
        let auth = serde_json::json!({
            "mode": "token",
            "token": instance.config.auth_token
        });
        gateway.insert("auth".to_string(), auth);
    }

    // Control UI configuration
    let control_ui = serde_json::json!({
        "enabled": true,
        "allowInsecureAuth": true
    });
    gateway.insert("controlUi".to_string(), control_ui);

    config.insert("gateway".to_string(), serde_json::Value::Object(gateway));

    // Agents configuration (workspace) - using agents.defaults
    // Check if OpenAI is enabled to set the primary model
    let has_openai = install_config.openai_enabled;

    let agents = if has_openai {
        serde_json::json!({
            "defaults": {
                "workspace": "~/.openclaw/workspace",
                "compaction": {
                    "mode": "safeguard"
                },
                "model": {
                    "primary": "openai-codex/gpt-5.2"
                }
            }
        })
    } else {
        serde_json::json!({
            "defaults": {
                "workspace": "~/.openclaw/workspace",
                "compaction": {
                    "mode": "safeguard"
                }
            }
        })
    };
    config.insert("agents".to_string(), agents);

    // Channels configuration
    let mut channels = serde_json::Map::new();

    // WhatsApp - just enable if selected (user will configure allowFrom later)
    if instance.config.providers.whatsapp {
        let whatsapp = serde_json::json!({
            "dmPolicy": "pairing"
        });
        channels.insert("whatsapp".to_string(), whatsapp);
    }

    // Telegram
    if instance.config.providers.telegram.enabled {
        let mut telegram = serde_json::Map::new();
        telegram.insert("enabled".to_string(), serde_json::json!(true));
        if !instance.config.providers.telegram.token.is_empty() {
            telegram.insert("botToken".to_string(), serde_json::json!(instance.config.providers.telegram.token));
        }
        channels.insert("telegram".to_string(), serde_json::Value::Object(telegram));
    }

    // Discord
    if instance.config.providers.discord.enabled {
        let mut discord = serde_json::Map::new();
        discord.insert("enabled".to_string(), serde_json::json!(true));
        if !instance.config.providers.discord.token.is_empty() {
            discord.insert("token".to_string(), serde_json::json!(instance.config.providers.discord.token));
        }
        discord.insert("dm".to_string(), serde_json::json!({ "enabled": true }));
        channels.insert("discord".to_string(), serde_json::Value::Object(discord));
    }

    if !channels.is_empty() {
        config.insert("channels".to_string(), serde_json::Value::Object(channels));
    }

    // Auth configuration for model providers
    let auth = serde_json::json!({
        "profiles": {
            "openai-codex:default": {
                "provider": "openai-codex",
                "mode": "oauth"
            },
            "anthropic:manual": {
                "provider": "anthropic",
                "mode": "token"
            }
        }
    });
    config.insert("auth".to_string(), auth);

    // Write config as JSON
    let content = serde_json::to_string_pretty(&serde_json::Value::Object(config))
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(config_file, content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}

async fn generate_docker_compose(
    instance: &ClawpitInstance,
    _config: &InstallConfig,
) -> Result<(), String> {
    let instance_dir = PathBuf::from(&instance.path);

    // Ensure workspace and data directories exist
    let workspace_dir = instance_dir.join("workspace");
    let data_dir = instance_dir.join("data");

    fs::create_dir_all(&workspace_dir)
        .map_err(|e| format!("Failed to create workspace directory: {}", e))?;
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    // Determine bind mode
    let bind_mode = match instance.config.bind_mode {
        crate::models::BindMode::Local => "local",
        crate::models::BindMode::Lan => "lan",
    };

    // Generate .env file with instance-specific values
    // These variables are used by the docker-compose.yml template
    let env_content = format!(
        r#"# OpenClaw Instance Configuration
# Generated by Clawpit for instance: {}
# Instance ID: {}

# Docker image to use
OPENCLAW_IMAGE=falleco/clawpit:latest

# Container prefix for unique naming
OPENCLAW_CONTAINER_PREFIX={}

# Directory paths (inside container)
OPENCLAW_CONFIG_DIR={}
OPENCLAW_WORKSPACE_DIR={}

# Network configuration
OPENCLAW_GATEWAY_PORT={}
OPENCLAW_BRIDGE_PORT={}
OPENCLAW_GATEWAY_BIND={}

# Authentication
OPENCLAW_GATEWAY_TOKEN={}

# Claude AI Session Keys (to be configured)
CLAUDE_AI_SESSION_KEY=
CLAUDE_WEB_SESSION_KEY=
CLAUDE_WEB_COOKIE=

# Provider configuration (for future use)
# OPENCLAW_WHATSAPP_ENABLED={}
# OPENCLAW_TELEGRAM_ENABLED={}
# OPENCLAW_TELEGRAM_TOKEN={}
# OPENCLAW_DISCORD_ENABLED={}
# OPENCLAW_DISCORD_TOKEN={}
"#,
        instance.config.name,
        instance.config.id,
        instance.config.id, // Container prefix uses instance ID for uniqueness
        data_dir.to_string_lossy(),
        workspace_dir.to_string_lossy(),
        instance.config.gateway_port,
        instance.config.bridge_port,
        bind_mode,
        instance.config.auth_token,
        instance.config.providers.whatsapp,
        instance.config.providers.telegram.enabled,
        instance.config.providers.telegram.token,
        instance.config.providers.discord.enabled,
        instance.config.providers.discord.token,
    );

    fs::write(instance_dir.join(".env"), env_content)
        .map_err(|e| format!("Failed to write .env file: {}", e))?;

    // Copy the docker-compose.yml template from bundled resources
    // The template uses environment variables from .env
    let compose_template = include_str!("../../resources/docker-compose.yml");

    fs::write(instance_dir.join("docker-compose.yml"), compose_template)
        .map_err(|e| format!("Failed to write docker-compose.yml: {}", e))?;

    Ok(())
}

/// Get agents defined in the OpenClaw config for an instance
#[tauri::command]
pub async fn get_instance_agents(
    clawpit_dir: String,
    instance_id: String,
) -> Result<crate::models::InstanceAgents, String> {
    use crate::models::{AgentIdentity, InstanceAgents, OpenClawAgent};

    let config_path = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id)
        .join("data")
        .join("config.json");

    // Default "main" agent that's always present in OpenClaw
    let default_main_agent = OpenClawAgent {
        id: "main".to_string(),
        name: "Main".to_string(),
        identity: AgentIdentity {
            name: "Main Agent".to_string(),
            theme: "Default OpenClaw agent".to_string(),
            emoji: "🤖".to_string(),
            avatar: String::new(),
        },
        skills: vec![],
        workspace: String::new(),
        agent_dir: String::new(),
    };

    if !config_path.exists() {
        // Return default main agent if config doesn't exist yet
        return Ok(InstanceAgents {
            agents: vec![default_main_agent],
        });
    }

    let config_content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse config file: {}", e))?;

    let mut agents: Vec<OpenClawAgent> = Vec::new();

    // Parse agents.list from the config
    if let Some(agents_obj) = config.get("agents") {
        if let Some(list) = agents_obj.get("list") {
            if let Some(list_arr) = list.as_array() {
                for agent_val in list_arr {
                    let id = agent_val
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    if id.is_empty() {
                        continue;
                    }

                    let name = agent_val
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    let identity = if let Some(identity_obj) = agent_val.get("identity") {
                        AgentIdentity {
                            name: identity_obj
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            theme: identity_obj
                                .get("theme")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            emoji: identity_obj
                                .get("emoji")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            avatar: identity_obj
                                .get("avatar")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        }
                    } else {
                        AgentIdentity::default()
                    };

                    let skills = agent_val
                        .get("skills")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|s| s.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();

                    let workspace = agent_val
                        .get("workspace")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    let agent_dir = agent_val
                        .get("agentDir")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    agents.push(OpenClawAgent {
                        id,
                        name,
                        identity,
                        skills,
                        workspace,
                        agent_dir,
                    });
                }
            }
        }
    }

    // If no agents found, return the default main agent
    if agents.is_empty() {
        agents.push(default_main_agent);
    }

    Ok(InstanceAgents { agents })
}

/// Execute a command in the openclaw-cli container of an instance
#[tauri::command]
pub async fn execute_instance_cli_command(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
    command: String,
    wsl_distro: Option<String>,
) -> Result<String, String> {
    use crate::platform::create_executor;

    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    let executor = create_executor(&app, wsl_distro);
    let working_dir = executor.normalize_path(&instance_dir.to_string_lossy());
    let working_path = Path::new(&working_dir);

    // Parse the command into parts (split by whitespace, respecting quotes)
    let command_parts: Vec<&str> = command.split_whitespace().collect();

    if command_parts.is_empty() {
        return Err("No command provided".to_string());
    }

    // Build args for: docker compose run --rm openclaw-cli <command parts>
    // Use -e to set environment variables that force color output
    // Note: We don't use -T (disable TTY) to allow color output
    let mut args: Vec<&str> = vec![
        "run", "--rm",
        "-e", "FORCE_COLOR=1",
        "-e", "CLICOLOR_FORCE=1",
        "-e", "TERM=xterm-256color",
        "-e", "NO_COLOR=",
        "openclaw-cli"
    ];
    args.extend(command_parts.iter());

    let result = executor.run_docker_compose(&args, Some(working_path)).await?;

    // Combine stdout and stderr for complete output
    let mut output = result.stdout;
    if !result.stderr.is_empty() {
        if !output.is_empty() && !output.ends_with('\n') {
            output.push('\n');
        }
        output.push_str(&result.stderr);
    }

    if result.success {
        Ok(output)
    } else {
        // Return the output even on failure so user can see what happened
        if output.is_empty() {
            Err("Command failed with no output".to_string())
        } else {
            Ok(output)
        }
    }
}
