// OAuth authentication commands for model providers

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use std::io::{Read, Write};
use tauri::Emitter;

// OpenAI Codex OAuth configuration
const OPENAI_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_AUTH_URL: &str = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const REDIRECT_PORT: u16 = 1455;
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const SCOPES: &str = "openid profile email offline_access";

/// Token response from OpenAI
#[derive(Debug, Clone, Serialize, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
    token_type: String,
}

/// Auth profile stored in auth-profiles.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthProfile {
    #[serde(rename = "type")]
    auth_type: String,
    provider: String,
    access: String,
    refresh: String,
    expires: u64,
    account_id: String,
}

/// Auth profiles file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthProfilesFile {
    version: u32,
    profiles: HashMap<String, AuthProfile>,
    #[serde(default)]
    last_good: HashMap<String, String>,
    #[serde(default)]
    usage_stats: HashMap<String, UsageStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageStats {
    last_used: u64,
    error_count: u32,
}

/// Result of starting OAuth flow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartResult {
    pub success: bool,
    pub auth_url: Option<String>,
    pub error: Option<String>,
}

/// Result of OAuth completion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthCompleteResult {
    pub success: bool,
    pub provider: String,
    pub account_id: Option<String>,
    pub error: Option<String>,
}

/// OAuth progress event
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthProgressEvent {
    step: String,
    message: String,
    is_error: bool,
}

/// Generate a random string for PKCE code verifier
fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Generate PKCE code challenge from verifier (S256)
fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    URL_SAFE_NO_PAD.encode(result)
}

/// Generate a random state string for CSRF protection
fn generate_state() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Build the authorization URL with PKCE
fn build_auth_url(code_challenge: &str, state: &str) -> String {
    let params = [
        ("response_type", "code"),
        ("client_id", OPENAI_CLIENT_ID),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPES),
        ("code_challenge", code_challenge),
        ("code_challenge_method", "S256"),
        ("state", state),
        ("id_token_add_organizations", "true"),
        ("codex_cli_simplified_flow", "true"),
        ("originator", "clawpit"),
    ];

    let query = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    format!("{}?{}", OPENAI_AUTH_URL, query)
}

/// Extract account ID from JWT access token
fn extract_account_id(access_token: &str) -> Option<String> {
    // JWT is base64url encoded with 3 parts separated by dots
    let parts: Vec<&str> = access_token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    // Decode the payload (second part)
    let payload_bytes = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    let payload_str = String::from_utf8(payload_bytes).ok()?;
    let payload: serde_json::Value = serde_json::from_str(&payload_str).ok()?;

    // Try to extract chatgpt_account_id from https://api.openai.com/auth claim
    payload
        .get("https://api.openai.com/auth")
        .and_then(|auth| auth.get("chatgpt_account_id"))
        .and_then(|id| id.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            // Fallback to sub claim
            payload.get("sub").and_then(|s| s.as_str()).map(|s| s.to_string())
        })
}

/// Get the auth profiles file path for an instance
fn get_auth_profiles_path(clawpit_dir: &str, instance_id: &str) -> PathBuf {
    PathBuf::from(clawpit_dir)
        .join("instances")
        .join(instance_id)
        .join("data")
        .join("agents")
        .join("main")
        .join("agent")
        .join("auth-profiles.json")
}

/// Load existing auth profiles or create empty
fn load_auth_profiles(path: &PathBuf) -> AuthProfilesFile {
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(profiles) = serde_json::from_str(&content) {
                return profiles;
            }
        }
    }

    AuthProfilesFile {
        version: 1,
        profiles: HashMap::new(),
        last_good: HashMap::new(),
        usage_stats: HashMap::new(),
    }
}

/// Save auth profiles to file
fn save_auth_profiles(path: &PathBuf, profiles: &AuthProfilesFile) -> Result<(), String> {
    // Ensure parent directories exist
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create auth directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(profiles)
        .map_err(|e| format!("Failed to serialize auth profiles: {}", e))?;

    fs::write(path, content)
        .map_err(|e| format!("Failed to write auth profiles: {}", e))?;

    Ok(())
}

/// Exchange authorization code for tokens
async fn exchange_code_for_tokens(
    code: &str,
    code_verifier: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();

    let params = [
        ("client_id", OPENAI_CLIENT_ID),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", REDIRECT_URI),
        ("code_verifier", code_verifier),
    ];

    let response = client
        .post(OPENAI_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to exchange code: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed ({}): {}", status, body));
    }

    response
        .json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))
}

/// Start the OpenAI Codex OAuth flow
#[tauri::command]
pub async fn start_openai_oauth(
    app: tauri::AppHandle,
    clawpit_dir: String,
    instance_id: String,
) -> Result<OAuthCompleteResult, String> {
    use std::time::Duration;

    let emit_progress = |step: &str, message: &str, is_error: bool| {
        let _ = app.emit("oauth-progress", OAuthProgressEvent {
            step: step.to_string(),
            message: message.to_string(),
            is_error,
        });
    };

    // Verify instance exists
    let instance_dir = PathBuf::from(&clawpit_dir)
        .join("instances")
        .join(&instance_id);

    if !instance_dir.exists() {
        return Err(format!("Instance '{}' not found", instance_id));
    }

    emit_progress("init", "Initializing OAuth flow...", false);

    // Generate PKCE parameters
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state = generate_state();

    // Build authorization URL
    let auth_url = build_auth_url(&code_challenge, &state);

    emit_progress("server", "Starting local callback server...", false);

    // Start local server to receive callback
    let listener = TcpListener::bind(format!("127.0.0.1:{}", REDIRECT_PORT))
        .map_err(|e| format!("Failed to bind to port {}: {}. Is another process using it?", REDIRECT_PORT, e))?;

    // Set timeout for the listener
    listener.set_nonblocking(true)
        .map_err(|e| format!("Failed to set non-blocking: {}", e))?;

    emit_progress("browser", "Opening browser for authentication...", false);

    // Open browser with auth URL
    if let Err(e) = open::that(&auth_url) {
        emit_progress("browser", &format!("Failed to open browser: {}. Please open manually.", e), true);
    }

    emit_progress("waiting", "Waiting for authentication callback...", false);

    // Wait for callback with timeout (5 minutes)
    let timeout = Duration::from_secs(300);
    let start = std::time::Instant::now();
    let mut auth_code: Option<String> = None;
    let mut received_state: Option<String> = None;

    loop {
        if start.elapsed() > timeout {
            return Err("Authentication timed out. Please try again.".to_string());
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                // Read the HTTP request
                let mut buffer = [0u8; 4096];
                let bytes_read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);

                // Parse the request to extract code and state
                if let Some(path_line) = request.lines().next() {
                    if path_line.contains("/auth/callback") {
                        // Extract query parameters
                        if let Some(query_start) = path_line.find('?') {
                            let query_end = path_line.find(" HTTP").unwrap_or(path_line.len());
                            let query = &path_line[query_start + 1..query_end];

                            for param in query.split('&') {
                                let parts: Vec<&str> = param.split('=').collect();
                                if parts.len() == 2 {
                                    match parts[0] {
                                        "code" => auth_code = Some(urlencoding::decode(parts[1]).unwrap_or_default().to_string()),
                                        "state" => received_state = Some(urlencoding::decode(parts[1]).unwrap_or_default().to_string()),
                                        _ => {}
                                    }
                                }
                            }
                        }

                        // Send success response
                        let html_response = r#"<!DOCTYPE html>
<html>
<head>
    <title>Authentication Successful</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
        }
        h1 { margin-bottom: 10px; }
        p { opacity: 0.9; }
        .checkmark {
            font-size: 64px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="checkmark">✓</div>
        <h1>Authentication Successful!</h1>
        <p>You can close this window and return to Clawpit.</p>
    </div>
</body>
</html>"#;

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html_response.len(),
                            html_response
                        );

                        let _ = stream.write_all(response.as_bytes());
                        let _ = stream.flush();
                        break;
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // No connection yet, wait a bit
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(e) => {
                return Err(format!("Server error: {}", e));
            }
        }
    }

    // Validate state
    let auth_code = auth_code.ok_or("No authorization code received")?;
    let received_state = received_state.ok_or("No state received")?;

    if received_state != state {
        return Err("State mismatch - possible CSRF attack".to_string());
    }

    emit_progress("exchange", "Exchanging authorization code for tokens...", false);

    // Exchange code for tokens
    let tokens = exchange_code_for_tokens(&auth_code, &code_verifier).await?;

    // Extract account ID from access token
    let account_id = extract_account_id(&tokens.access_token)
        .unwrap_or_else(|| "unknown".to_string());

    emit_progress("saving", "Saving authentication credentials...", false);

    // Calculate expiration timestamp
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let expires = now + (tokens.expires_in * 1000);

    // Load existing profiles and update
    let auth_path = get_auth_profiles_path(&clawpit_dir, &instance_id);
    let mut profiles = load_auth_profiles(&auth_path);

    let profile_key = "openai-codex:default".to_string();

    profiles.profiles.insert(profile_key.clone(), AuthProfile {
        auth_type: "oauth".to_string(),
        provider: "openai-codex".to_string(),
        access: tokens.access_token,
        refresh: tokens.refresh_token.unwrap_or_default(),
        expires,
        account_id: account_id.clone(),
    });

    profiles.last_good.insert("openai-codex".to_string(), profile_key.clone());

    profiles.usage_stats.insert(profile_key, UsageStats {
        last_used: now,
        error_count: 0,
    });

    save_auth_profiles(&auth_path, &profiles)?;

    emit_progress("complete", "Authentication completed successfully!", false);

    Ok(OAuthCompleteResult {
        success: true,
        provider: "openai-codex".to_string(),
        account_id: Some(account_id),
        error: None,
    })
}

/// Check if OpenAI Codex is authenticated for an instance
#[tauri::command]
pub async fn check_openai_auth(
    clawpit_dir: String,
    instance_id: String,
) -> Result<bool, String> {
    let auth_path = get_auth_profiles_path(&clawpit_dir, &instance_id);
    let profiles = load_auth_profiles(&auth_path);

    // Check if we have a valid openai-codex profile
    if let Some(profile) = profiles.profiles.get("openai-codex:default") {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // Check if not expired (with 5 minute buffer)
        if profile.expires > now + 300000 {
            return Ok(true);
        }

        // If expired but has refresh token, we can still consider it "authenticated"
        // as we can refresh the token when needed
        if !profile.refresh.is_empty() {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Refresh OpenAI tokens if needed
#[tauri::command]
pub async fn refresh_openai_tokens(
    clawpit_dir: String,
    instance_id: String,
) -> Result<bool, String> {
    let auth_path = get_auth_profiles_path(&clawpit_dir, &instance_id);
    let mut profiles = load_auth_profiles(&auth_path);

    let profile = profiles
        .profiles
        .get("openai-codex:default")
        .ok_or("No OpenAI profile found")?
        .clone();

    if profile.refresh.is_empty() {
        return Err("No refresh token available".to_string());
    }

    let client = reqwest::Client::new();

    let params = [
        ("client_id", OPENAI_CLIENT_ID),
        ("grant_type", "refresh_token"),
        ("refresh_token", &profile.refresh),
    ];

    let response = client
        .post(OPENAI_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed ({}): {}", status, body));
    }

    let tokens: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Update profile with new tokens
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let expires = now + (tokens.expires_in * 1000);

    let account_id = extract_account_id(&tokens.access_token)
        .unwrap_or(profile.account_id.clone());

    let profile_key = "openai-codex:default".to_string();

    profiles.profiles.insert(profile_key.clone(), AuthProfile {
        auth_type: "oauth".to_string(),
        provider: "openai-codex".to_string(),
        access: tokens.access_token,
        refresh: tokens.refresh_token.unwrap_or(profile.refresh),
        expires,
        account_id,
    });

    profiles.usage_stats.insert(profile_key, UsageStats {
        last_used: now,
        error_count: 0,
    });

    save_auth_profiles(&auth_path, &profiles)?;

    Ok(true)
}
