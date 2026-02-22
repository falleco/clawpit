// Template management Tauri commands

use crate::models::{MemberAvatarInfo, TeamDefinition, TeamMember, TeamsIndex, Template, TemplateSummary};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn get_dev_templates_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("templates")
}

fn push_unique_path(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|existing| existing == &candidate) {
        paths.push(candidate);
    }
}

fn get_templates_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    // In dev, prefer source `resources/templates` so newly added files appear immediately.
    if cfg!(debug_assertions) {
        push_unique_path(&mut dirs, get_dev_templates_dir());
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        push_unique_path(&mut dirs, resource_dir.join("templates"));
        push_unique_path(
            &mut dirs,
            resource_dir.join("resources").join("templates"),
        );
    }

    push_unique_path(&mut dirs, get_dev_templates_dir());

    dirs
}

fn find_templates_dir(app: &AppHandle) -> Option<PathBuf> {
    for dir in get_templates_dirs(app) {
        let teams_json = dir.join("teams.json");
        if teams_json.exists() {
            return Some(dir);
        }
    }
    None
}

fn load_teams_index(templates_dir: &PathBuf) -> Result<TeamsIndex, String> {
    let teams_json_path = templates_dir.join("teams.json");
    let content = fs::read_to_string(&teams_json_path)
        .map_err(|e| format!("Failed to read teams.json: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse teams.json: {}", e))
}

fn load_team_definition(templates_dir: &PathBuf, team_id: &str) -> Result<TeamDefinition, String> {
    let team_json_path = templates_dir.join(team_id).join("team.json");
    let content = fs::read_to_string(&team_json_path)
        .map_err(|e| format!("Failed to read team.json for {}: {}", team_id, e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse team.json for {}: {}", team_id, e))
}

fn load_member_definition(
    templates_dir: &PathBuf,
    team_id: &str,
    member_id: &str,
) -> Result<TeamMember, String> {
    let definition_path = templates_dir
        .join(team_id)
        .join(member_id)
        .join("definition.json");
    let content = fs::read_to_string(&definition_path)
        .map_err(|e| format!("Failed to read definition.json for {}/{}: {}", team_id, member_id, e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse definition.json for {}/{}: {}", team_id, member_id, e))
}

/// Resolve a relative image path to an absolute file path
fn resolve_image_path(templates_dir: &PathBuf, team_id: &str, relative_path: &str) -> Option<String> {
    // Remove leading "./" if present
    let clean_path = relative_path.trim_start_matches("./");
    let full_path = templates_dir.join(team_id).join(clean_path);

    if full_path.exists() {
        Some(full_path.to_string_lossy().to_string())
    } else {
        None
    }
}

/// Resolve a member's avatar path
fn resolve_member_avatar(templates_dir: &PathBuf, team_id: &str, member_id: &str, relative_path: &str) -> Option<String> {
    let clean_path = relative_path.trim_start_matches("./");
    let full_path = templates_dir.join(team_id).join(member_id).join(clean_path);

    if full_path.exists() {
        Some(full_path.to_string_lossy().to_string())
    } else {
        None
    }
}

fn load_template(templates_dir: &PathBuf, team_id: &str) -> Result<Template, String> {
    let team_def = load_team_definition(templates_dir, team_id)?;

    let mut members = Vec::new();
    for member_id in &team_def.members {
        match load_member_definition(templates_dir, team_id, member_id) {
            Ok(mut member) => {
                // Resolve avatar path to absolute
                if !member.identity.avatar.is_empty() {
                    if let Some(resolved) = resolve_member_avatar(templates_dir, team_id, member_id, &member.identity.avatar) {
                        member.identity.avatar = resolved;
                    }
                }
                members.push(member);
            }
            Err(e) => {
                // Log warning but continue loading other members
                eprintln!("Warning: {}", e);
            }
        }
    }

    // Resolve team image path
    let image = team_def.image.as_ref().and_then(|img| {
        resolve_image_path(templates_dir, team_id, img)
    });

    Ok(Template {
        id: team_def.id,
        name: team_def.name,
        description: team_def.description,
        image,
        members,
    })
}

fn create_template_summary(template: &Template) -> TemplateSummary {
    TemplateSummary {
        id: template.id.clone(),
        name: template.name.clone(),
        description: template.description.clone(),
        image: template.image.clone(),
        member_count: template.members.len(),
        member_avatars: template
            .members
            .iter()
            .map(|m| MemberAvatarInfo {
                id: m.id.clone(),
                name: m.name.clone(),
                role: m.role.clone(),
                emoji: m.identity.emoji.clone(),
                avatar: if m.identity.avatar.is_empty() {
                    None
                } else {
                    Some(m.identity.avatar.clone())
                },
            })
            .collect(),
    }
}

#[tauri::command]
pub async fn list_templates(app: AppHandle) -> Result<Vec<TemplateSummary>, String> {
    let templates_dir = find_templates_dir(&app)
        .ok_or_else(|| "Templates directory not found".to_string())?;

    let teams_index = load_teams_index(&templates_dir)?;

    let mut templates = Vec::new();
    for team_id in &teams_index.teams {
        match load_template(&templates_dir, team_id) {
            Ok(template) => templates.push(create_template_summary(&template)),
            Err(e) => {
                eprintln!("Warning: Failed to load template {}: {}", team_id, e);
            }
        }
    }

    Ok(templates)
}

#[tauri::command]
pub async fn get_template(app: AppHandle, id: String) -> Result<Template, String> {
    let templates_dir = find_templates_dir(&app)
        .ok_or_else(|| "Templates directory not found".to_string())?;

    load_template(&templates_dir, &id)
}
