use regex::Regex;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurableInstance {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedEnvVar {
    pub key: String,
    pub value: String,
    pub description: String,
    pub default_value: Option<String>,
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfigurationBundle {
    pub openclaw_config: String,
    pub env_vars: Vec<ManagedEnvVar>,
    pub compose_file: String,
    pub compose_override: String,
    pub extra_mounts: Vec<String>,
    pub additional_packages: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOutcome {
    pub backup_paths: Vec<String>,
    pub restart_required: bool,
    pub message: String,
}

fn validate_instance_id(instance_id: &str) -> Result<(), String> {
    let id_regex = Regex::new(r"^[a-zA-Z0-9_-]+$")
        .map_err(|e| format!("Failed to compile ID validation regex: {}", e))?;
    if !id_regex.is_match(instance_id) {
        return Err("Invalid instance ID format".to_string());
    }
    Ok(())
}

fn resolve_instance_dir(clawpit_dir: &str, instance_id: &str) -> Result<PathBuf, String> {
    validate_instance_id(instance_id)?;
    let dir = Path::new(clawpit_dir).join("instances").join(instance_id);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Instance '{}' was not found", instance_id));
    }
    Ok(dir)
}

fn create_backup(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let parent = path
        .parent()
        .ok_or_else(|| "Failed to resolve backup parent directory".to_string())?;
    let backups_dir = parent.join("backups");
    fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let file_name = path
        .file_name()
        .ok_or_else(|| "Failed to resolve backup file name".to_string())?
        .to_string_lossy()
        .to_string();

    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let backup_path = backups_dir.join(format!("{}-{}.bak", file_name, timestamp));

    fs::copy(path, &backup_path).map_err(|e| {
        format!(
            "Failed to create backup for '{}': {}",
            path.display(),
            e
        )
    })?;

    Ok(Some(backup_path.to_string_lossy().to_string()))
}

fn read_lines(path: &Path) -> Result<Vec<String>, String> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;
    Ok(content
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect())
}

fn parse_env_file(content: &str) -> BTreeMap<String, String> {
    let mut env_map = BTreeMap::new();
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            env_map.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    env_map
}

fn format_env_file(map: &BTreeMap<String, String>) -> String {
    let mut lines = vec![
        "# Environment variables managed by Clawpit Settings".to_string(),
        "# You can edit these values from the Settings page.".to_string(),
        "".to_string(),
    ];

    for (key, value) in map {
        lines.push(format!("{}={}", key, value));
    }

    lines.push(String::new());
    lines.join("\n")
}

fn get_env_description(key: &str) -> &'static str {
    match key {
        "OPENCLAW_IMAGE" => "Docker image used to run OpenClaw.",
        "OPENCLAW_CONTAINER_PREFIX" => "Container prefix to isolate this instance.",
        "OPENCLAW_CONFIG_DIR" => "Path used by OpenClaw to store runtime data.",
        "OPENCLAW_WORKSPACE_DIR" => "Workspace directory for generated files.",
        "OPENCLAW_GATEWAY_PORT" => "Gateway HTTP port exposed on the host.",
        "OPENCLAW_BRIDGE_PORT" => "Bridge port exposed on the host.",
        "OPENCLAW_GATEWAY_BIND" => "Binding mode: local or lan.",
        "OPENCLAW_GATEWAY_TOKEN" => "Gateway authentication token.",
        "CLAUDE_AI_SESSION_KEY" => "Claude AI session key.",
        "CLAUDE_WEB_SESSION_KEY" => "Claude web session key.",
        "CLAUDE_WEB_COOKIE" => "Claude web cookie string.",
        _ => "Custom environment variable.",
    }
}

fn get_default_env_map(instance_dir: &Path) -> Result<BTreeMap<String, String>, String> {
    let instance_config_path = instance_dir.join("instance.json");
    let content = fs::read_to_string(&instance_config_path)
        .map_err(|e| format!("Failed to read instance config: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse instance config: {}", e))?;

    let instance_id = json["id"].as_str().unwrap_or("default");
    let gateway_port = json["gatewayPort"].as_u64().unwrap_or(18789);
    let bridge_port = json["bridgePort"].as_u64().unwrap_or(18790);
    let bind_mode = json["bindMode"].as_str().unwrap_or("local");
    let auth_token = json["authToken"].as_str().unwrap_or("");

    let data_dir = instance_dir.join("data");
    let workspace_dir = instance_dir.join("workspace");

    let mut defaults = BTreeMap::new();
    defaults.insert("OPENCLAW_IMAGE".to_string(), "falleco/clawpit:latest".to_string());
    defaults.insert(
        "OPENCLAW_CONTAINER_PREFIX".to_string(),
        instance_id.to_string(),
    );
    defaults.insert(
        "OPENCLAW_CONFIG_DIR".to_string(),
        data_dir.to_string_lossy().to_string(),
    );
    defaults.insert(
        "OPENCLAW_WORKSPACE_DIR".to_string(),
        workspace_dir.to_string_lossy().to_string(),
    );
    defaults.insert("OPENCLAW_GATEWAY_PORT".to_string(), gateway_port.to_string());
    defaults.insert("OPENCLAW_BRIDGE_PORT".to_string(), bridge_port.to_string());
    defaults.insert("OPENCLAW_GATEWAY_BIND".to_string(), bind_mode.to_string());
    defaults.insert("OPENCLAW_GATEWAY_TOKEN".to_string(), auth_token.to_string());
    defaults.insert("CLAUDE_AI_SESSION_KEY".to_string(), String::new());
    defaults.insert("CLAUDE_WEB_SESSION_KEY".to_string(), String::new());
    defaults.insert("CLAUDE_WEB_COOKIE".to_string(), String::new());

    Ok(defaults)
}

fn load_managed_env_vars(instance_dir: &Path) -> Result<Vec<ManagedEnvVar>, String> {
    let env_path = instance_dir.join(".env");
    let defaults = get_default_env_map(instance_dir)?;
    let current = if env_path.exists() {
        let content = fs::read_to_string(&env_path)
            .map_err(|e| format!("Failed to read environment file: {}", e))?;
        parse_env_file(&content)
    } else {
        BTreeMap::new()
    };

    let mut keys = BTreeSet::new();
    keys.extend(defaults.keys().cloned());
    keys.extend(current.keys().cloned());

    let mut vars = Vec::new();
    for key in keys {
        let value = current
            .get(&key)
            .cloned()
            .or_else(|| defaults.get(&key).cloned())
            .unwrap_or_default();
        let default_value = defaults.get(&key).cloned();
        let is_custom = !defaults.contains_key(&key);

        vars.push(ManagedEnvVar {
            key: key.clone(),
            value,
            description: get_env_description(&key).to_string(),
            default_value,
            is_custom,
        });
    }

    Ok(vars)
}

#[tauri::command]
pub async fn list_configurable_instances(
    clawpit_dir: String,
) -> Result<Vec<ConfigurableInstance>, String> {
    let instances_dir = Path::new(&clawpit_dir).join("instances");
    if !instances_dir.exists() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(instances_dir)
        .map_err(|e| format!("Failed to read instances directory: {}", e))?;

    let mut result = Vec::new();
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let id = match path.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => continue,
        };

        let instance_json = path.join("instance.json");
        if !instance_json.exists() {
            continue;
        }

        let name = fs::read_to_string(&instance_json)
            .ok()
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
            .and_then(|json| json["name"].as_str().map(|n| n.to_string()))
            .unwrap_or_else(|| id.clone());

        result.push(ConfigurableInstance { id, name });
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

#[tauri::command]
pub async fn get_instance_configuration_bundle(
    clawpit_dir: String,
    instance_id: String,
) -> Result<InstanceConfigurationBundle, String> {
    let instance_dir = resolve_instance_dir(&clawpit_dir, &instance_id)?;

    let openclaw_config_path = instance_dir.join("data").join("config.json");
    let openclaw_config = if openclaw_config_path.exists() {
        fs::read_to_string(&openclaw_config_path)
            .map_err(|e| format!("Failed to read OpenClaw config: {}", e))?
    } else {
        "{}\n".to_string()
    };

    let compose_file_path = instance_dir.join("docker-compose.yml");
    let compose_file = if compose_file_path.exists() {
        fs::read_to_string(&compose_file_path)
            .map_err(|e| format!("Failed to read docker-compose file: {}", e))?
    } else {
        String::new()
    };

    let compose_override_path = instance_dir.join("docker-compose.override.yml");
    let compose_override = if compose_override_path.exists() {
        fs::read_to_string(&compose_override_path)
            .map_err(|e| format!("Failed to read docker-compose override file: {}", e))?
    } else {
        String::new()
    };

    let extra_mounts = read_lines(&instance_dir.join("extra-mounts.txt"))?;
    let additional_packages = read_lines(&instance_dir.join("packages.txt"))?;
    let env_vars = load_managed_env_vars(&instance_dir)?;

    Ok(InstanceConfigurationBundle {
        openclaw_config,
        env_vars,
        compose_file,
        compose_override,
        extra_mounts,
        additional_packages,
    })
}

#[tauri::command]
pub async fn save_instance_openclaw_config(
    clawpit_dir: String,
    instance_id: String,
    content: String,
) -> Result<SaveOutcome, String> {
    let instance_dir = resolve_instance_dir(&clawpit_dir, &instance_id)?;
    let config_dir = instance_dir.join("data");
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    let config_path = config_dir.join("config.json");
    let backup = create_backup(&config_path)?;

    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Configuration must be valid JSON: {}", e))?;
    let formatted = serde_json::to_string_pretty(&parsed)
        .map_err(|e| format!("Failed to format JSON configuration: {}", e))?;

    fs::write(&config_path, formatted)
        .map_err(|e| format!("Failed to save OpenClaw configuration: {}", e))?;

    Ok(SaveOutcome {
        backup_paths: backup.into_iter().collect(),
        restart_required: true,
        message: "OpenClaw configuration saved. Restart the instance to apply changes.".to_string(),
    })
}

#[tauri::command]
pub async fn update_instance_env_var(
    clawpit_dir: String,
    instance_id: String,
    key: String,
    value: String,
) -> Result<SaveOutcome, String> {
    let key_regex = Regex::new(r"^[A-Z0-9_]+$")
        .map_err(|e| format!("Failed to compile env key regex: {}", e))?;
    if !key_regex.is_match(&key) {
        return Err("Environment variable key must contain only A-Z, 0-9 and _".to_string());
    }

    let instance_dir = resolve_instance_dir(&clawpit_dir, &instance_id)?;
    let env_path = instance_dir.join(".env");
    let backup = create_backup(&env_path)?;

    let mut map = if env_path.exists() {
        let content = fs::read_to_string(&env_path)
            .map_err(|e| format!("Failed to read environment file: {}", e))?;
        parse_env_file(&content)
    } else {
        get_default_env_map(&instance_dir)?
    };

    map.insert(key.clone(), value);
    fs::write(&env_path, format_env_file(&map))
        .map_err(|e| format!("Failed to write environment file: {}", e))?;

    Ok(SaveOutcome {
        backup_paths: backup.into_iter().collect(),
        restart_required: true,
        message: format!("Environment variable '{}' updated.", key),
    })
}

#[tauri::command]
pub async fn reset_instance_env_var(
    clawpit_dir: String,
    instance_id: String,
    key: String,
) -> Result<SaveOutcome, String> {
    let instance_dir = resolve_instance_dir(&clawpit_dir, &instance_id)?;
    let env_path = instance_dir.join(".env");
    let backup = create_backup(&env_path)?;

    let defaults = get_default_env_map(&instance_dir)?;
    let mut map = if env_path.exists() {
        let content = fs::read_to_string(&env_path)
            .map_err(|e| format!("Failed to read environment file: {}", e))?;
        parse_env_file(&content)
    } else {
        defaults.clone()
    };

    if let Some(default_value) = defaults.get(&key) {
        map.insert(key.clone(), default_value.clone());
    } else {
        map.remove(&key);
    }

    fs::write(&env_path, format_env_file(&map))
        .map_err(|e| format!("Failed to write environment file: {}", e))?;

    Ok(SaveOutcome {
        backup_paths: backup.into_iter().collect(),
        restart_required: true,
        message: format!("Environment variable '{}' reset.", key),
    })
}

#[tauri::command]
pub async fn save_instance_compose_customization(
    clawpit_dir: String,
    instance_id: String,
    compose_override: String,
    extra_mounts: Vec<String>,
    additional_packages: Vec<String>,
) -> Result<SaveOutcome, String> {
    let instance_dir = resolve_instance_dir(&clawpit_dir, &instance_id)?;

    for mount in &extra_mounts {
        if !mount.contains(':') {
            return Err(format!("Invalid mount '{}'. Use source:target format.", mount));
        }
    }

    if !compose_override.trim().is_empty() && !compose_override.contains("services:") {
        return Err("Compose override must include a 'services:' section.".to_string());
    }

    let override_path = instance_dir.join("docker-compose.override.yml");
    let mounts_path = instance_dir.join("extra-mounts.txt");
    let packages_path = instance_dir.join("packages.txt");

    let mut backups = Vec::new();
    if let Some(path) = create_backup(&override_path)? {
        backups.push(path);
    }
    if let Some(path) = create_backup(&mounts_path)? {
        backups.push(path);
    }
    if let Some(path) = create_backup(&packages_path)? {
        backups.push(path);
    }

    fs::write(&override_path, compose_override)
        .map_err(|e| format!("Failed to save docker-compose override file: {}", e))?;
    fs::write(&mounts_path, format!("{}\n", extra_mounts.join("\n")))
        .map_err(|e| format!("Failed to save extra mounts: {}", e))?;
    fs::write(&packages_path, format!("{}\n", additional_packages.join("\n")))
        .map_err(|e| format!("Failed to save additional packages: {}", e))?;

    Ok(SaveOutcome {
        backup_paths: backups,
        restart_required: true,
        message: "Compose customization saved. Restart the instance to apply changes.".to_string(),
    })
}

#[tauri::command]
pub async fn factory_reset_clawpit(clawpit_dir: String) -> Result<SaveOutcome, String> {
    let clawpit_path = PathBuf::from(&clawpit_dir);
    if clawpit_dir.trim().is_empty() {
        return Err("Clawpit directory cannot be empty".to_string());
    }

    if clawpit_path == PathBuf::from("/") {
        return Err("Refusing to reset root directory".to_string());
    }

    if !clawpit_path.exists() {
        return Err("Clawpit directory does not exist".to_string());
    }

    let backup_path = {
        let backup_name = format!(
            "{}-factory-reset-{}",
            clawpit_path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "clawpit".to_string()),
            chrono::Utc::now().format("%Y%m%d-%H%M%S")
        );

        clawpit_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(backup_name)
    };

    fs::rename(&clawpit_path, &backup_path).map_err(|e| {
        format!(
            "Failed to move current Clawpit directory to backup '{}': {}",
            backup_path.display(),
            e
        )
    })?;

    crate::commands::instance::create_clawpit_structure(clawpit_dir.clone()).await?;

    Ok(SaveOutcome {
        backup_paths: vec![backup_path.to_string_lossy().to_string()],
        restart_required: false,
        message: "Factory reset completed. Previous data was moved to a backup folder."
            .to_string(),
    })
}
