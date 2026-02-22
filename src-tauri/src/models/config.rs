// Configuration data structures for Clawpit

use serde::{Deserialize, Serialize};

/// Main application configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// OpenClaw configuration directory (WSL path on Windows)
    pub openclaw_dir: String,

    /// OpenClaw workspace directory
    pub workspace_dir: String,

    /// Selected WSL distribution (Windows only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wsl_distro: Option<String>,

    /// Network configuration
    pub network: NetworkConfig,

    /// Authentication configuration
    pub auth: AuthConfig,

    /// Application preferences
    pub preferences: AppPreferences,
}

/// Network-related configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkConfig {
    /// Gateway port (default: 18789)
    pub gateway_port: u16,

    /// Bridge port (default: 18790)
    pub bridge_port: u16,

    /// Binding mode: "local" (127.0.0.1) or "lan" (0.0.0.0)
    pub bind_mode: BindMode,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            gateway_port: 18789,
            bridge_port: 18790,
            bind_mode: BindMode::Local,
        }
    }
}

/// Network binding mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BindMode {
    /// Bind to localhost only (127.0.0.1)
    Local,
    /// Bind to all interfaces (0.0.0.0)
    Lan,
}

/// Authentication configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    /// Whether token authentication is enabled
    pub token_enabled: bool,

    /// The authentication token (stored securely)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// User preferences for the application
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppPreferences {
    /// Start application on system boot
    pub start_on_boot: bool,

    /// Minimize to system tray on close
    pub minimize_to_tray: bool,

    /// Start minimized
    pub start_minimized: bool,

    /// Show notifications
    pub notifications_enabled: bool,

    /// Auto-restart gateway on failure
    pub auto_restart: bool,

    /// Theme preference
    pub theme: Theme,

    /// Application log verbosity
    pub log_level: LogLevel,

    /// Enable debug mode
    pub debug_mode: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            start_on_boot: false,
            minimize_to_tray: true,
            start_minimized: false,
            notifications_enabled: true,
            auto_restart: false,
            theme: Theme::System,
            log_level: LogLevel::Info,
            debug_mode: false,
        }
    }
}

/// Application theme
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

/// Application log level
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
}

/// Platform-specific default paths
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultPaths {
    /// Default configuration directory
    pub config_dir: String,

    /// Default workspace directory
    pub workspace_dir: String,

    /// Windows-specific: UNC path to access WSL files from Windows
    #[serde(skip_serializing_if = "Option::is_none")]
    pub windows_unc_path: Option<String>,
}
