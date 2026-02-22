// Instance management data structures for Clawpit

use serde::{Deserialize, Serialize};

/// Status of an OpenClaw instance
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum InstanceStatus {
    Running,
    Stopped,
    Starting,
    Stopping,
    Error,
    Unknown,
}

impl Default for InstanceStatus {
    fn default() -> Self {
        Self::Unknown
    }
}

/// Provider configuration for an instance
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    /// WhatsApp provider enabled
    pub whatsapp: bool,

    /// Telegram provider configuration
    pub telegram: TelegramConfig,

    /// Discord provider configuration
    pub discord: DiscordConfig,
}

/// Telegram provider configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TelegramConfig {
    pub enabled: bool,
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub token: String,
}

/// Discord provider configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscordConfig {
    pub enabled: bool,
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub token: String,
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

impl Default for BindMode {
    fn default() -> Self {
        Self::Local
    }
}

/// Configuration for a single OpenClaw instance
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfig {
    /// Unique instance identifier (folder name)
    pub id: String,

    /// Display name for the instance
    pub name: String,

    /// Optional description
    #[serde(default)]
    pub description: String,

    /// Gateway port
    pub gateway_port: u16,

    /// Bridge port
    pub bridge_port: u16,

    /// Binding mode (local or lan)
    pub bind_mode: BindMode,

    /// Authentication token
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub auth_token: String,

    /// Whether the token was auto-generated
    #[serde(default)]
    pub token_generated: bool,

    /// Provider configuration
    #[serde(default)]
    pub providers: ProviderConfig,
}

impl Default for InstanceConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            description: String::new(),
            gateway_port: 18789,
            bridge_port: 18790,
            bind_mode: BindMode::Lan,
            auth_token: String::new(),
            token_generated: false,
            providers: ProviderConfig::default(),
        }
    }
}

/// Full instance data including metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClawpitInstance {
    /// Instance configuration
    #[serde(flatten)]
    pub config: InstanceConfig,

    /// Full path to instance directory
    pub path: String,

    /// Creation timestamp (ISO 8601)
    pub created_at: String,

    /// Last used timestamp (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<String>,

    /// Current status
    #[serde(default)]
    pub status: InstanceStatus,
}

/// Result of directory validation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryValidation {
    /// Whether the directory is valid
    pub valid: bool,

    /// Error message if invalid
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,

    /// Disk space information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_space: Option<DiskSpaceResult>,

    /// Whether the directory already exists
    pub exists: bool,

    /// Whether the directory is writable
    pub writable: bool,

    /// Whether there's an existing Clawpit installation
    pub has_existing_installation: bool,
}

/// Disk space information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpaceResult {
    /// Available space in GB
    pub available: f64,

    /// Total space in GB
    pub total: f64,
}

/// Default paths for Clawpit
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClawpitPaths {
    /// Default Clawpit root directory
    pub clawpit_dir: String,

    /// WSL path (same as clawpit_dir on Unix)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wsl_path: Option<String>,

    /// Windows UNC path to access from Windows Explorer
    #[serde(skip_serializing_if = "Option::is_none")]
    pub windows_path: Option<String>,
}

/// Installation configuration passed from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallConfig {
    /// Clawpit root directory
    pub clawpit_dir: String,

    /// Instance configuration
    pub instance: InstanceConfig,

    /// Platform name
    pub platform: String,

    /// WSL distribution (Windows only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wsl_distro: Option<String>,

    /// Skip Docker operations (for testing/development)
    #[serde(default)]
    pub skip_docker: bool,

    /// Whether OpenAI models are enabled
    #[serde(default)]
    pub openai_enabled: bool,
}

/// Result of port availability check
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortCheckResult {
    /// Whether the port is available
    pub available: bool,

    /// Error message if unavailable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Update fields for an instance (all optional)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstanceUpdate {
    /// New display name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// New description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// New gateway port
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway_port: Option<u16>,

    /// New bridge port
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bridge_port: Option<u16>,

    /// New binding mode
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bind_mode: Option<BindMode>,

    /// New authentication token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_token: Option<String>,

    /// New provider configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub providers: Option<ProviderConfig>,
}

/// Suggested ports for a new instance
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedPorts {
    /// Suggested gateway port
    pub gateway_port: u16,

    /// Suggested bridge port
    pub bridge_port: u16,
}

/// Metadata stored alongside instance configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceMetadata {
    /// Creation timestamp (ISO 8601)
    pub created_at: String,

    /// Last used timestamp (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<String>,
}


/// Status of core services (egress proxy, networks)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreServicesStatus {
    /// Whether core files are installed
    pub installed: bool,

    /// Whether core services are running
    pub running: bool,

    /// Whether egress proxy is healthy
    pub egress_healthy: bool,

    /// Whether required networks are created
    pub networks_created: bool,
}

/// Information about a single container
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerInfo {
    /// Container ID (short form, first 12 chars)
    pub id: String,

    /// Container name
    pub name: String,

    /// Container state: running, exited, paused, restarting, dead
    pub state: String,

    /// Whether the container has health issues or has been restarting
    pub has_errors: bool,

    /// Restart count
    pub restart_count: u32,

    /// Container IPv4 address (preferentially on clawpit-internal network)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip_address: Option<String>,
}

/// Container information for an instance
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceContainersInfo {
    /// Gateway container info
    pub gateway: Option<ContainerInfo>,

    /// Ingress container info
    pub ingress: Option<ContainerInfo>,
}

/// Parsed egress proxy log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EgressLogEntry {
    /// Timestamp of the request (ISO 8601 when possible)
    pub time: String,

    /// Requested domain
    pub domain: String,

    /// Raw proxy status (e.g. TCP_TUNNEL/200, TCP_DENIED/403)
    pub status: String,

    /// Access decision derived from status: approved or refused
    pub decision: String,

    /// Source IP that made the request
    pub ip: String,
}

/// Agent identity information from OpenClaw config
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentIdentity {
    /// Display name
    #[serde(default)]
    pub name: String,

    /// Theme/role description
    #[serde(default)]
    pub theme: String,

    /// Emoji representation
    #[serde(default)]
    pub emoji: String,

    /// Path to avatar image (relative to agent directory or absolute)
    #[serde(default)]
    pub avatar: String,
}

impl Default for AgentIdentity {
    fn default() -> Self {
        Self {
            name: String::new(),
            theme: String::new(),
            emoji: String::new(),
            avatar: String::new(),
        }
    }
}

/// Agent definition from OpenClaw config (agents.list)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawAgent {
    /// Unique agent identifier
    pub id: String,

    /// Agent name (can be at top level or in identity)
    #[serde(default)]
    pub name: String,

    /// Agent identity (name, theme, emoji, avatar)
    #[serde(default)]
    pub identity: AgentIdentity,

    /// List of skills enabled for this agent
    #[serde(default)]
    pub skills: Vec<String>,

    /// Workspace path (optional)
    #[serde(default)]
    pub workspace: String,

    /// Agent directory (optional)
    #[serde(default)]
    pub agent_dir: String,
}

impl OpenClawAgent {
    /// Get the display name, preferring identity.name over top-level name
    pub fn display_name(&self) -> &str {
        if !self.identity.name.is_empty() {
            &self.identity.name
        } else if !self.name.is_empty() {
            &self.name
        } else {
            &self.id
        }
    }
}

/// List of agents for an instance
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceAgents {
    /// List of agents defined in the OpenClaw config
    pub agents: Vec<OpenClawAgent>,
}
