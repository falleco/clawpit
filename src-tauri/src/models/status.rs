// Status and health check data structures

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Overall system health status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    /// Detected platform
    pub platform: Platform,

    /// WSL status (Windows only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wsl_status: Option<WslStatus>,

    /// Docker installation status
    pub docker: DependencyStatus,

    /// Docker Compose installation status
    pub docker_compose: DependencyStatus,

    /// Git installation status
    pub git: DependencyStatus,

    /// Network connectivity status
    pub network: NetworkConnectivityStatus,

    /// Disk space information
    pub disk_space: DiskSpaceInfo,

    /// Whether all prerequisites are met
    pub all_passed: bool,

    /// List of errors/issues found
    pub errors: Vec<PrerequisiteError>,

    /// Timestamp of this check
    pub timestamp: DateTime<Utc>,
}

/// Detected platform/OS
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Windows,
    MacOS,
    Linux,
}

impl std::fmt::Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Platform::Windows => write!(f, "windows"),
            Platform::MacOS => write!(f, "macos"),
            Platform::Linux => write!(f, "linux"),
        }
    }
}

/// Status of a dependency (Docker, Docker Compose, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    /// Whether the dependency is installed
    pub installed: bool,

    /// Whether the dependency is running (for services like Docker)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub running: Option<bool>,

    /// Version string if available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,

    /// Error message if check failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Default for DependencyStatus {
    fn default() -> Self {
        Self {
            installed: false,
            running: None,
            version: None,
            error: None,
        }
    }
}

/// Internet/network connectivity status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkConnectivityStatus {
    /// Whether the connectivity test succeeded
    pub reachable: bool,

    /// Endpoint used for verification
    pub endpoint: String,

    /// Measured latency in milliseconds, when available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u128>,

    /// Error if connectivity failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// WSL2 status information (Windows only)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslStatus {
    /// Whether WSL is installed
    pub installed: bool,

    /// Whether WSL2 is the default version
    pub is_wsl2: bool,

    /// List of installed distributions
    pub distributions: Vec<WslDistro>,

    /// Default distribution name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_distro: Option<String>,

    /// Error message if check failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// WSL distribution information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslDistro {
    /// Distribution name
    pub name: String,

    /// Whether this is the default distribution
    pub is_default: bool,

    /// WSL version (1 or 2)
    pub wsl_version: u8,

    /// Current state (Running, Stopped, etc.)
    pub state: String,
}

/// Disk space information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpaceInfo {
    /// Available space in GB
    pub available_gb: f64,

    /// Total space in GB
    pub total_gb: f64,

    /// Whether there's enough space (typically > 5GB)
    pub sufficient: bool,

    /// Path that was checked
    pub path: String,
}

/// Prerequisite check error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrerequisiteError {
    /// Error code for programmatic handling
    pub code: String,

    /// Human-readable error message
    pub message: String,

    /// Suggested fix/action
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,

    /// Severity level
    pub severity: ErrorSeverity,
}

/// Error severity level
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ErrorSeverity {
    /// Blocks installation/operation
    Error,
    /// Should be addressed but not blocking
    Warning,
    /// Informational only
    Info,
}

/// Gateway service status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatus {
    /// Whether the container exists
    pub exists: bool,

    /// Container state (running, stopped, etc.)
    pub state: ContainerState,

    /// Container health status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health: Option<String>,

    /// Container uptime
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime: Option<String>,

    /// Exposed ports
    pub ports: Vec<PortMapping>,

    /// Error message if any
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Container state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ContainerState {
    Running,
    Stopped,
    Starting,
    Stopping,
    Restarting,
    Paused,
    Dead,
    Unknown,
}

impl Default for ContainerState {
    fn default() -> Self {
        Self::Unknown
    }
}

/// Port mapping information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortMapping {
    /// Container port
    pub container_port: u16,

    /// Host port
    pub host_port: u16,

    /// Protocol (tcp/udp)
    pub protocol: String,
}

/// Command execution output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutput {
    /// Whether the command succeeded (exit code 0)
    pub success: bool,

    /// Exit code
    pub exit_code: Option<i32>,

    /// Standard output
    pub stdout: String,

    /// Standard error
    pub stderr: String,
}

// =============================================================================
// Health Monitoring Types (Milestone 4.4)
// =============================================================================

/// Health monitoring configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthMonitoringConfig {
    /// Enable automatic health monitoring
    pub enabled: bool,

    /// Health check interval in seconds
    pub check_interval_secs: u32,

    /// CPU usage threshold percentage (0-100)
    pub cpu_threshold_percent: f64,

    /// Memory usage threshold percentage (0-100)
    pub memory_threshold_percent: f64,

    /// Disk usage threshold percentage (0-100)
    pub disk_threshold_percent: f64,

    /// Enable auto-recovery on failure
    pub auto_recovery_enabled: bool,

    /// Maximum auto-recovery attempts before giving up
    pub max_recovery_attempts: u32,

    /// Cooldown period between recovery attempts in seconds
    pub recovery_cooldown_secs: u32,

    /// Enable desktop notifications for alerts
    pub notifications_enabled: bool,
}

impl Default for HealthMonitoringConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            check_interval_secs: 30,
            cpu_threshold_percent: 90.0,
            memory_threshold_percent: 85.0,
            disk_threshold_percent: 90.0,
            auto_recovery_enabled: false,
            max_recovery_attempts: 3,
            recovery_cooldown_secs: 60,
            notifications_enabled: true,
        }
    }
}

/// Current health metrics for an instance
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthMetrics {
    /// Instance ID
    pub instance_id: String,

    /// Instance name
    pub instance_name: String,

    /// CPU usage percentage (0-100)
    pub cpu_percent: Option<f64>,

    /// Memory usage in MB
    pub memory_used_mb: Option<f64>,

    /// Memory limit in MB
    pub memory_limit_mb: Option<f64>,

    /// Memory usage percentage (0-100)
    pub memory_percent: Option<f64>,

    /// Disk usage percentage (0-100)
    pub disk_percent: Option<f64>,

    /// Disk used in GB
    pub disk_used_gb: Option<f64>,

    /// Disk total in GB
    pub disk_total_gb: Option<f64>,

    /// Gateway connectivity status
    pub gateway_reachable: bool,

    /// Container health status (healthy, unhealthy, starting, none)
    pub container_health: Option<String>,

    /// Container state
    pub container_state: ContainerState,

    /// Number of running containers
    pub running_containers: u32,

    /// Total containers for this instance
    pub total_containers: u32,

    /// Timestamp of this measurement
    pub timestamp: DateTime<Utc>,

    /// Any error message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Health alert types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum HealthAlertType {
    /// CPU usage exceeded threshold
    HighCpuUsage,
    /// Memory usage exceeded threshold
    HighMemoryUsage,
    /// Disk usage exceeded threshold
    HighDiskUsage,
    /// Container is unhealthy
    ContainerUnhealthy,
    /// Container stopped unexpectedly
    ContainerStopped,
    /// Gateway is not reachable
    GatewayUnreachable,
    /// Docker daemon is not running
    DockerNotRunning,
    /// Auto-recovery was triggered
    AutoRecoveryTriggered,
    /// Auto-recovery succeeded
    AutoRecoverySuccess,
    /// Auto-recovery failed
    AutoRecoveryFailed,
    /// Instance started
    InstanceStarted,
    /// Instance stopped
    InstanceStopped,
}

impl std::fmt::Display for HealthAlertType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::HighCpuUsage => write!(f, "High CPU Usage"),
            Self::HighMemoryUsage => write!(f, "High Memory Usage"),
            Self::HighDiskUsage => write!(f, "High Disk Usage"),
            Self::ContainerUnhealthy => write!(f, "Container Unhealthy"),
            Self::ContainerStopped => write!(f, "Container Stopped"),
            Self::GatewayUnreachable => write!(f, "Gateway Unreachable"),
            Self::DockerNotRunning => write!(f, "Docker Not Running"),
            Self::AutoRecoveryTriggered => write!(f, "Auto-Recovery Triggered"),
            Self::AutoRecoverySuccess => write!(f, "Auto-Recovery Success"),
            Self::AutoRecoveryFailed => write!(f, "Auto-Recovery Failed"),
            Self::InstanceStarted => write!(f, "Instance Started"),
            Self::InstanceStopped => write!(f, "Instance Stopped"),
        }
    }
}

/// Health alert severity
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    /// Informational alert
    Info,
    /// Warning - should be addressed
    Warning,
    /// Critical - requires immediate attention
    Critical,
}

impl std::fmt::Display for AlertSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Info => write!(f, "info"),
            Self::Warning => write!(f, "warning"),
            Self::Critical => write!(f, "critical"),
        }
    }
}

/// A health alert
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthAlert {
    /// Unique alert ID
    pub id: String,

    /// Instance ID this alert relates to (None for global alerts)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_id: Option<String>,

    /// Alert type
    pub alert_type: HealthAlertType,

    /// Alert severity
    pub severity: AlertSeverity,

    /// Alert title
    pub title: String,

    /// Detailed message
    pub message: String,

    /// Current value that triggered the alert (e.g., "92%")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_value: Option<String>,

    /// Threshold value (e.g., "90%")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threshold_value: Option<String>,

    /// Timestamp when alert was created
    pub created_at: DateTime<Utc>,

    /// Whether the alert has been acknowledged
    pub acknowledged: bool,

    /// Whether the alert has been resolved
    pub resolved: bool,

    /// Timestamp when alert was resolved
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<DateTime<Utc>>,
}

impl HealthAlert {
    /// Create a new health alert
    pub fn new(
        instance_id: Option<String>,
        alert_type: HealthAlertType,
        severity: AlertSeverity,
        title: String,
        message: String,
    ) -> Self {
        Self {
            id: format!("{}-{}", chrono::Utc::now().timestamp_millis(), rand::random::<u16>()),
            instance_id,
            alert_type,
            severity,
            title,
            message,
            current_value: None,
            threshold_value: None,
            created_at: chrono::Utc::now(),
            acknowledged: false,
            resolved: false,
            resolved_at: None,
        }
    }

    /// Create alert with threshold values
    pub fn with_values(mut self, current: String, threshold: String) -> Self {
        self.current_value = Some(current);
        self.threshold_value = Some(threshold);
        self
    }
}

/// Auto-recovery status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoRecoveryStatus {
    /// Instance ID
    pub instance_id: String,

    /// Whether auto-recovery is currently active
    pub is_recovering: bool,

    /// Number of recovery attempts made
    pub attempts_made: u32,

    /// Maximum attempts allowed
    pub max_attempts: u32,

    /// Last recovery attempt timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_attempt_at: Option<DateTime<Utc>>,

    /// Next retry timestamp (if in cooldown)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_retry_at: Option<DateTime<Utc>>,

    /// Last error message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,

    /// Whether recovery was successful
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success: Option<bool>,
}

/// Summary of all health metrics across instances
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSummary {
    /// Overall health status (healthy, degraded, critical, unknown)
    pub overall_status: String,

    /// Number of healthy instances
    pub healthy_instances: u32,

    /// Number of degraded instances
    pub degraded_instances: u32,

    /// Number of critical instances
    pub critical_instances: u32,

    /// Total instances
    pub total_instances: u32,

    /// Active alerts count by severity
    pub active_alerts: AlertCounts,

    /// Individual instance metrics
    pub instances: Vec<HealthMetrics>,

    /// Active (unresolved) alerts
    pub alerts: Vec<HealthAlert>,

    /// Timestamp of this summary
    pub timestamp: DateTime<Utc>,
}

/// Alert counts by severity
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AlertCounts {
    pub info: u32,
    pub warning: u32,
    pub critical: u32,
}
