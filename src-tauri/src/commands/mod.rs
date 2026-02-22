// Commands module - Tauri command handlers

use crate::models::HealthMonitoringConfig;

pub mod config;
pub mod docker;
pub mod git;
pub mod health;
pub mod instance;
pub mod oauth;
pub mod platform;
pub mod runtime;
pub mod settings;
pub mod templates;

/// Application state managed by Tauri
pub struct AppState {
    /// Selected WSL distribution (Windows only)
    pub wsl_distro: Option<String>,

    /// Clawpit root directory path
    pub clawpit_dir: Option<String>,

    /// Currently active instance ID
    pub active_instance: Option<String>,

    /// Health monitoring configuration
    pub health_config: HealthMonitoringConfig,

    /// Internal flag to allow process exit when close events are intercepted.
    pub allow_exit: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            wsl_distro: None,
            clawpit_dir: None,
            active_instance: None,
            health_config: HealthMonitoringConfig::default(),
            allow_exit: false,
        }
    }
}
