// Template data structures for team templates

use serde::{Deserialize, Serialize};

/// Agent identity information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentIdentity {
    pub name: String,
    pub theme: String,
    pub emoji: String,
    pub avatar: String,
}

/// Tools configuration for an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTools {
    pub profile: String,
}

/// A team member (agent) definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub skills: Vec<String>,
    pub identity: AgentIdentity,
    pub tools: AgentTools,
}

/// Team definition from team.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub image: Option<String>,
    pub members: Vec<String>,
}

/// Teams index from teams.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamsIndex {
    pub teams: Vec<String>,
}

/// A complete template with team info and loaded members
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    pub members: Vec<TeamMember>,
}

/// Member avatar info for summary view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberAvatarInfo {
    pub id: String,
    pub name: String,
    pub role: String,
    pub emoji: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

/// Summary view of a template for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    pub member_count: usize,
    pub member_avatars: Vec<MemberAvatarInfo>,
}
