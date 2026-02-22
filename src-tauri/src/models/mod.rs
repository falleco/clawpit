// Models module - data structures for Clawpit

pub mod config;
pub mod instance;
pub mod status;
pub mod template;

// Re-export commonly used types
pub use config::{
    AppConfig, AppPreferences, AuthConfig, DefaultPaths, LogLevel, NetworkConfig, Theme,
};
pub use config::BindMode as ConfigBindMode;
pub use instance::{
    AgentIdentity, BindMode, ClawpitInstance, ClawpitPaths, ContainerInfo, CoreServicesStatus,
    DirectoryValidation, DiskSpaceResult, DiscordConfig, EgressLogEntry, InstallConfig,
    InstanceAgents, InstanceConfig, InstanceContainersInfo, InstanceMetadata, InstanceStatus,
    InstanceUpdate, OpenClawAgent, PortCheckResult, ProviderConfig, SuggestedPorts,
    TelegramConfig,
};
pub use status::{
    AlertCounts, AlertSeverity, AutoRecoveryStatus, CommandOutput, ContainerState, DependencyStatus,
    DiskSpaceInfo, ErrorSeverity, GatewayStatus, HealthAlert, HealthAlertType, HealthMetrics,
    HealthMonitoringConfig, HealthStatus, HealthSummary, Platform, PortMapping, PrerequisiteError,
    NetworkConnectivityStatus, WslDistro, WslStatus,
};
pub use template::{
    AgentIdentity as TemplateAgentIdentity, AgentTools, MemberAvatarInfo, TeamDefinition,
    TeamMember, TeamsIndex, Template, TemplateSummary,
};
