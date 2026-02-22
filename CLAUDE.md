# AGENTS.md - AI Agent Guidelines for Clawpit Development

> Best practices and recommendations for AI agents working on this Tauri v2 project.

## Project Context

Clawpit is a Tauri v2 desktop application designed to simplify OpenClaw management for non-technical users. The app uses:
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Rust with Tauri 2
- **Package Manager**: Bun
- **Target Users**: Non-technical users who need guided setup and management

### Core Dependencies (User's System)
- **Docker** with Docker Compose v2 plugin
- **Git** for OpenClaw workspace operations
- **WSL2** (Windows only) for running Docker and Git commands

### Platform Architecture
| Platform | App Runs On | Commands Execute In |
|----------|-------------|---------------------|
| Windows | Native Windows | WSL2 (via `wsl` command) |
| macOS | Native macOS | Native shell |
| Linux | Native Linux | Native shell |

---

## Tauri v2 Architecture Principles

### Process Model
- Tauri uses a **multi-process architecture** with clear separation between the Rust backend (core) and the WebView frontend
- The **Rust backend** handles system operations, security-sensitive tasks, and business logic
- The **frontend** handles UI rendering and user interaction
- Communication happens via **IPC (Inter-Process Communication)** using commands and events

### Security-First Design
- **Never trust frontend input** - always validate in Rust commands
- Use the **capabilities system** to explicitly grant permissions
- Apply **principle of least privilege** for all plugin permissions
- **Scope shell commands** to prevent arbitrary command execution
- **Sanitize all user input** before using in shell commands or file paths

---

## Coding Standards

### Rust Backend (`src-tauri/src/`)

#### Command Structure
```rust
// Always use async commands for I/O operations
#[tauri::command]
async fn my_command(
    param: String,
    app: tauri::AppHandle,  // Access app resources
) -> Result<ResponseType, String> {
    // Validate input
    if param.is_empty() {
        return Err("Parameter cannot be empty".to_string());
    }

    // Perform operation
    // Return Result for proper error handling
    Ok(response)
}
```

#### Error Handling
- Always return `Result<T, String>` from commands for proper frontend error handling
- Use descriptive error messages that help users understand what went wrong
- Log errors with appropriate detail for debugging
- Never expose internal implementation details in user-facing errors

#### Module Organization
```
src-tauri/src/
├── lib.rs          # Entry point, command registration
├── commands/       # Tauri commands (thin wrappers)
│   ├── mod.rs
│   └── *.rs
├── services/       # Business logic
│   ├── mod.rs
│   └── *.rs
├── models/         # Data structures
│   ├── mod.rs
│   └── *.rs
└── utils/          # Helper functions
    ├── mod.rs
    └── *.rs
```

### Frontend (`src/`)

#### File Naming Convention

**All TypeScript and TSX files MUST use kebab-case (lowercase with hyphens).**

| Type | Pattern | Example |
|------|---------|---------|
| Components | `component-name.tsx` | `gradient-text.tsx`, `dashboard-layout.tsx` |
| Hooks | `use-hook-name.ts` | `use-config-commands.ts`, `use-health-commands.ts` |
| Stores | `store-name.ts` | `config-store.ts`, `instance-store.ts` |
| Utils/Lib | `utility-name.ts` | `token-storage.ts`, `utils.ts` |
| Types | `type-name.ts` | `index.ts` |

**DO NOT use:**
- PascalCase: ~~`GradientText.tsx`~~ → `gradient-text.tsx`
- camelCase: ~~`useConfigCommands.ts`~~ → `use-config-commands.ts`
- Mixed case: ~~`instanceStore.ts`~~ → `instance-store.ts`

**Exceptions:**
- Single-word files are fine: `main.tsx`, `utils.ts`, `theme.tsx`
- Index files: `index.ts`

#### Component Structure
```typescript
// Prefer function components with hooks
export function MyComponent({ prop }: MyComponentProps) {
  // Hooks at the top
  const [state, setState] = useState<Type>(initialValue);
  const { data, isLoading, error } = useMyCommand();

  // Early returns for loading/error states
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error} />;

  // Main render
  return <div>...</div>;
}
```

#### Tauri Command Invocation
```typescript
import { invoke } from '@tauri-apps/api/core';

// Always type your commands
interface MyResponse {
  field: string;
}

// Use try-catch for error handling
async function callCommand(): Promise<MyResponse> {
  try {
    const result = await invoke<MyResponse>('my_command', { param: 'value' });
    return result;
  } catch (error) {
    // Handle error appropriately
    console.error('Command failed:', error);
    throw error;
  }
}
```

#### Custom Hooks for Commands
```typescript
// Create hooks to encapsulate command logic
export function useMyCommand() {
  const [data, setData] = useState<MyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (param: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<MyResponse>('my_command', { param });
      setData(result);
      return result;
    } catch (e) {
      setError(e as string);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, execute };
}
```

---

## Plugin Usage Guidelines

### Shell Plugin (`tauri-plugin-shell`)
**Critical for this project** - Used for Docker, Docker Compose, Git, and WSL commands.

```rust
// In Cargo.toml
tauri-plugin-shell = "2"

// In capabilities/default.json - SCOPE ALL COMMANDS
{
  "permissions": [
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "docker",
          "cmd": "docker",
          "args": true
        },
        {
          "name": "git",
          "cmd": "git",
          "args": true
        },
        {
          "name": "wsl",
          "cmd": "wsl",
          "args": true  // Windows only - routes commands to WSL2
        }
      ]
    }
  ]
}
```

**Note on Docker Compose**: Use `docker compose` (v2) as a subcommand of Docker, NOT the standalone `docker-compose` (v1). This is why we only need to whitelist `docker`.

**Security Rules:**
- NEVER allow arbitrary shell command execution
- Define explicit command scopes in capabilities
- Validate all arguments before passing to shell
- Sanitize user input to prevent injection
- Use command sidecar for complex scripts
- **Windows**: Only execute via `wsl -d <distro> -- <command>`, never raw shell commands

### Filesystem Plugin (`tauri-plugin-fs`)
```rust
// Scope to specific directories only
{
  "permissions": [
    {
      "identifier": "fs:allow-read",
      "allow": [
        { "path": "$APPCONFIG/**" },
        { "path": "$HOME/.openclaw/**" }
      ]
    }
  ]
}
```

### Store Plugin (`tauri-plugin-store`)
- Use for persistent user preferences
- Do NOT store sensitive data (tokens) in plaintext
- Consider encryption for sensitive values

### Dialog Plugin (`tauri-plugin-dialog`)
- Use for file/folder selection
- Provides native OS dialogs
- Safer than custom path input

### Notification Plugin (`tauri-plugin-notification`)
- Request permission before showing notifications
- Use sparingly to avoid notification fatigue
- Provide notification preferences in settings

---

## Security Checklist

### Before Every PR
- [ ] All shell commands are scoped in capabilities
- [ ] User input is validated in Rust before use
- [ ] No hardcoded secrets or tokens
- [ ] Sensitive data is not logged
- [ ] File operations are scoped to allowed directories
- [ ] Error messages don't leak system information
- [ ] **WSL commands specify distribution explicitly** (Windows)
- [ ] **Docker Compose commands use v2 syntax** (`docker compose` not `docker-compose`)
- [ ] **Git commands only operate on allowed repositories**
- [ ] **Path conversions are tested for both platforms**

### Shell Command Safety
```rust
// BAD - Never do this
let output = Command::new("sh")
    .args(["-c", &format!("docker {}", user_input)])
    .output();

// GOOD - Use explicit commands with validated args
let output = Command::new("docker")
    .args(["logs", &validated_container_name])
    .output();
```

### Input Validation
```rust
// Validate before use
fn validate_container_name(name: &str) -> Result<&str, String> {
    // Only allow alphanumeric, dash, underscore
    if name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        Ok(name)
    } else {
        Err("Invalid container name".to_string())
    }
}
```

---

## IPC Communication Patterns

### Commands (Frontend → Rust)
Use for **request-response** operations:
```typescript
// Frontend
const result = await invoke('get_status');

// Rust
#[tauri::command]
async fn get_status() -> Result<Status, String> { ... }
```

### Events (Rust → Frontend)
Use for **streaming data** or **async notifications**:
```rust
// Rust - emit event
app.emit("log-entry", LogEntry { ... })?;

// Frontend - listen
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<LogEntry>('log-entry', (event) => {
  console.log('New log:', event.payload);
});
```

### Channels (Bidirectional Streaming)
Use for **real-time bidirectional** communication:
```rust
#[tauri::command]
async fn stream_logs(on_event: Channel<LogEntry>) -> Result<(), String> {
  loop {
    on_event.send(LogEntry { ... })?;
  }
}
```

---

## State Management

### Rust-side State
```rust
// Define state
struct AppState {
    config: Mutex<Config>,
}

// Register in builder
.manage(AppState { config: Mutex::new(Config::default()) })

// Access in commands
#[tauri::command]
async fn get_config(state: State<'_, AppState>) -> Result<Config, String> {
    let config = state.config.lock().unwrap();
    Ok(config.clone())
}
```

### Frontend State (Zustand)
```typescript
// stores/configStore.ts
import { create } from 'zustand';

interface ConfigStore {
  config: Config | null;
  isLoading: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (config: Partial<Config>) => Promise<void>;
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  isLoading: false,
  loadConfig: async () => {
    set({ isLoading: true });
    try {
      const config = await invoke<Config>('get_config');
      set({ config, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  updateConfig: async (updates) => {
    await invoke('update_config', { updates });
    // Reload to ensure consistency
    await get().loadConfig();
  },
}));
```

---

## File Structure Conventions

### Configuration Files
- `tauri.conf.json` - Main Tauri configuration
- `capabilities/*.json` - Permission definitions
- `Cargo.toml` - Rust dependencies

### Bundle Resources
Place files that should be bundled with the app in:
- `src-tauri/resources/` - Bundled files (recipes, templates)
- Access via `app.path().resource_dir()`

### User Data Locations
```rust
// Use Tauri path APIs for cross-platform support
let config_dir = app.path().app_config_dir()?;  // ~/.config/clawpit
let data_dir = app.path().app_data_dir()?;      // ~/.local/share/clawpit
let cache_dir = app.path().app_cache_dir()?;    // ~/.cache/clawpit
```

---

## Testing Guidelines

### Rust Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_input() {
        assert!(validate_container_name("valid-name").is_ok());
        assert!(validate_container_name("invalid;name").is_err());
    }
}
```

### Frontend Tests (Vitest)
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock Tauri
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

---

## Performance Guidelines

### Frontend
- Lazy load heavy components
- Use `React.memo` for expensive renders
- Debounce frequent state updates
- Virtualize long lists

### Rust
- Use async for I/O operations
- Avoid blocking the main thread
- Cache expensive computations
- Use streaming for large data transfers

### IPC
- Batch related commands when possible
- Use events for frequent updates instead of polling
- Minimize payload size
- Avoid transferring large binary data through commands

---

## Common Patterns for This Project

### Platform-Aware Command Execution

**Critical**: All Docker, Docker Compose, and Git commands must go through the platform abstraction layer.

```rust
use tauri_plugin_shell::ShellExt;

/// Platform abstraction for command execution
pub struct CommandRunner {
    app: AppHandle,
    platform: Platform,
    wsl_distro: Option<String>,  // Windows only
}

impl CommandRunner {
    /// Execute a command with platform-appropriate method
    async fn run(&self, program: &str, args: &[&str]) -> Result<Output, Error> {
        match self.platform {
            Platform::Windows => self.run_via_wsl(program, args).await,
            Platform::MacOS | Platform::Linux => self.run_native(program, args).await,
        }
    }

    /// Windows: Route command through WSL
    async fn run_via_wsl(&self, program: &str, args: &[&str]) -> Result<Output, Error> {
        let distro = self.wsl_distro.as_ref()
            .ok_or("WSL distro not configured")?;

        let shell = self.app.shell();
        let mut wsl_args = vec!["-d", distro, "--", program];
        wsl_args.extend(args);

        shell.command("wsl")
            .args(&wsl_args)
            .output()
            .await
            .map_err(|e| e.into())
    }

    /// macOS/Linux: Execute directly
    async fn run_native(&self, program: &str, args: &[&str]) -> Result<Output, Error> {
        self.app.shell()
            .command(program)
            .args(args)
            .output()
            .await
            .map_err(|e| e.into())
    }
}
```

### Docker Compose Command Execution

**Always use Docker Compose v2** (`docker compose`) not v1 (`docker-compose`):

```rust
#[tauri::command]
async fn run_docker_compose(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    args: Vec<String>,
) -> Result<String, String> {
    let runner = CommandRunner::new(&app, &state);
    let working_dir = state.config.openclaw_dir.clone();

    // Build args: docker compose -f docker-compose.yml <args>
    let mut compose_args = vec!["compose"];

    // Add working directory for compose file location
    // Note: On Windows, this needs WSL path format
    if runner.is_windows() {
        let wsl_path = windows_to_wsl_path(&working_dir);
        compose_args.extend(&["-f", &format!("{}/docker-compose.yml", wsl_path)]);
    } else {
        compose_args.extend(&["-f", &format!("{}/docker-compose.yml", working_dir)]);
    }

    compose_args.extend(args.iter().map(|s| s.as_str()));

    let output = runner.run("docker", &compose_args).await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
```

### Git Command Execution

```rust
#[tauri::command]
async fn run_git_command(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    args: Vec<String>,
    working_dir: Option<String>,
) -> Result<String, String> {
    let runner = CommandRunner::new(&app, &state);

    let mut git_args: Vec<&str> = vec![];

    // Set working directory if provided
    if let Some(dir) = &working_dir {
        let dir_path = if runner.is_windows() {
            windows_to_wsl_path(dir)
        } else {
            dir.clone()
        };
        git_args.extend(&["-C", &dir_path]);
    }

    git_args.extend(args.iter().map(|s| s.as_str()));

    let output = runner.run("git", &git_args).await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
```

### Health Check Pattern

```rust
#[tauri::command]
async fn check_health(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<HealthStatus, String> {
    let runner = CommandRunner::new(&app, &state);

    // On Windows, first check if WSL is available
    let wsl_ok = if runner.is_windows() {
        check_wsl_running(&app).await.unwrap_or(false)
    } else {
        true  // Not applicable
    };

    // Check Docker daemon
    let docker_ok = runner
        .run("docker", &["info"])
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check Docker Compose version (v2 required)
    let compose_ok = runner
        .run("docker", &["compose", "version"])
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check Git
    let git_ok = runner
        .run("git", &["--version"])
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check OpenClaw container status
    let container_status = runner
        .run("docker", &["compose", "ps", "--format", "json"])
        .await
        .ok()
        .map(|o| parse_container_json(&o.stdout));

    Ok(HealthStatus {
        platform: runner.platform.to_string(),
        wsl_running: wsl_ok,  // Windows only
        docker_running: docker_ok,
        compose_available: compose_ok,
        git_available: git_ok,
        container_status,
        timestamp: chrono::Utc::now(),
    })
}
```

### Windows Path Conversion

```rust
/// Convert Windows path to WSL path format
/// C:\Users\name\.openclaw -> /mnt/c/Users/name/.openclaw
pub fn windows_to_wsl_path(windows_path: &str) -> String {
    let path = windows_path.replace('\\', "/");

    // Handle drive letter: C: -> /mnt/c
    if path.len() >= 2 && path.chars().nth(1) == Some(':') {
        let drive = path.chars().next().unwrap().to_lowercase().next().unwrap();
        format!("/mnt/{}{}", drive, &path[2..])
    } else {
        path
    }
}

/// Convert WSL path to Windows UNC path for file access
/// /home/user/.openclaw -> \\wsl$\Ubuntu\home\user\.openclaw
pub fn wsl_to_windows_unc(wsl_path: &str, distro: &str) -> String {
    format!("\\\\wsl$\\{}\\{}", distro, wsl_path.trim_start_matches('/').replace('/', "\\"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_windows_to_wsl_path() {
        assert_eq!(
            windows_to_wsl_path("C:\\Users\\name\\.openclaw"),
            "/mnt/c/Users/name/.openclaw"
        );
        assert_eq!(
            windows_to_wsl_path("D:\\data"),
            "/mnt/d/data"
        );
    }

    #[test]
    fn test_wsl_to_windows_unc() {
        assert_eq!(
            wsl_to_windows_unc("/home/user/.openclaw", "Ubuntu"),
            "\\\\wsl$\\Ubuntu\\home\\user\\.openclaw"
        );
    }
}
```

### Wizard State Persistence
```typescript
// Persist wizard state to survive app restart
import { Store } from '@tauri-apps/plugin-store';

const store = await Store.load('wizard-state.json');

export async function saveWizardState(state: WizardState) {
  await store.set('wizard', state);
  await store.save();
}

export async function loadWizardState(): Promise<WizardState | null> {
  return await store.get('wizard');
}
```

### Git Operations

Git is used for OpenClaw workspace management. All Git commands go through the platform abstraction layer.

```rust
/// Clone OpenClaw repository or template
#[tauri::command]
async fn clone_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_url: String,
    target_dir: String,
) -> Result<(), String> {
    // Validate URL (only allow known safe repositories)
    if !is_allowed_repository(&repo_url) {
        return Err("Repository not in allowlist".into());
    }

    let runner = CommandRunner::new(&app, &state);

    // Convert path for Windows
    let dir = if runner.is_windows() {
        windows_to_wsl_path(&target_dir)
    } else {
        target_dir
    };

    runner
        .run("git", &["clone", &repo_url, &dir])
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Pull latest changes
#[tauri::command]
async fn pull_updates(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_dir: String,
) -> Result<String, String> {
    let runner = CommandRunner::new(&app, &state);

    let dir = if runner.is_windows() {
        windows_to_wsl_path(&repo_dir)
    } else {
        repo_dir
    };

    let output = runner
        .run("git", &["-C", &dir, "pull", "--ff-only"])
        .await
        .map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Check repository status
#[tauri::command]
async fn check_repo_status(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_dir: String,
) -> Result<RepoStatus, String> {
    let runner = CommandRunner::new(&app, &state);

    let dir = if runner.is_windows() {
        windows_to_wsl_path(&repo_dir)
    } else {
        repo_dir
    };

    // Get current branch
    let branch = runner
        .run("git", &["-C", &dir, "rev-parse", "--abbrev-ref", "HEAD"])
        .await?;

    // Check for uncommitted changes
    let status = runner
        .run("git", &["-C", &dir, "status", "--porcelain"])
        .await?;

    // Check if behind remote
    let _ = runner.run("git", &["-C", &dir, "fetch"]).await;
    let behind = runner
        .run("git", &["-C", &dir, "rev-list", "--count", "HEAD..@{u}"])
        .await
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok())
        .unwrap_or(0);

    Ok(RepoStatus {
        branch: String::from_utf8_lossy(&branch.stdout).trim().to_string(),
        has_changes: !status.stdout.is_empty(),
        commits_behind: behind,
    })
}
```

**Git Security Considerations:**
- Only allow cloning from trusted repository URLs
- Never store Git credentials in the app
- Use system Git credential helpers
- Don't expose `.git` directories to users
- Validate all user input before passing to Git commands

---

## Windows WSL2 Guidelines

### Architecture Overview
On Windows, Clawpit runs as a native Windows application but ALL Docker, Docker Compose, and Git commands are executed inside WSL2.

```
┌─────────────────────────────────────────────────────────┐
│                 Windows (Native)                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Clawpit Tauri App                     │   │
│  │  • UI rendering (WebView2)                       │   │
│  │  • Configuration storage                         │   │
│  │  • User preferences                              │   │
│  └────────────────────┬────────────────────────────┘   │
│                       │                                  │
│           wsl -d Ubuntu -- docker compose ...           │
│                       │                                  │
│  ┌────────────────────▼────────────────────────────┐   │
│  │                   WSL2                           │   │
│  │  • Docker daemon                                 │   │
│  │  • Docker Compose                                │   │
│  │  • Git                                           │   │
│  │  • OpenClaw containers                           │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### WSL Command Execution Rules

```rust
// ALWAYS specify the distribution
let output = shell
    .command("wsl")
    .args(["-d", "Ubuntu", "--", "docker", "compose", "ps"])
    .output()
    .await;

// NEVER use wsl without -d (default may change)
// BAD: wsl docker ps
// GOOD: wsl -d Ubuntu -- docker ps

// Use --cd for working directory
let output = shell
    .command("wsl")
    .args(["-d", "Ubuntu", "--cd", "/home/user/.openclaw", "--", "docker", "compose", "up", "-d"])
    .output()
    .await;
```

### Path Handling on Windows

**Store paths in both formats:**
```rust
struct PathConfig {
    // User sees Windows path
    windows_path: String,     // C:\Users\name\.openclaw

    // Commands use WSL path
    wsl_path: String,         // /mnt/c/Users/name/.openclaw

    // For Tauri file operations, use UNC
    unc_path: String,         // \\wsl$\Ubuntu\home\user\.openclaw
}
```

**Recommended: Keep data in WSL filesystem for performance:**
```rust
// Better performance - data in WSL
let wsl_path = "/home/user/.openclaw";
let windows_access = "\\\\wsl$\\Ubuntu\\home\\user\\.openclaw";

// Slower - data on Windows filesystem accessed from WSL
let windows_path = "C:\\Users\\name\\.openclaw";
let wsl_access = "/mnt/c/Users/name/.openclaw";  // Much slower!
```

### WSL Status Checks

```rust
/// Check if WSL is available and running
async fn check_wsl_status(app: &AppHandle) -> Result<WslStatus, Error> {
    let shell = app.shell();

    // Check WSL version
    let version = shell
        .command("wsl")
        .args(["--version"])
        .output()
        .await?;

    // List distributions
    let distros = shell
        .command("wsl")
        .args(["--list", "--verbose"])
        .output()
        .await?;

    // Check if our target distro is running
    let status = parse_wsl_status(&distros.stdout)?;

    Ok(status)
}

/// Start WSL distribution if not running
async fn ensure_wsl_running(app: &AppHandle, distro: &str) -> Result<(), Error> {
    // This starts the distro and returns immediately
    app.shell()
        .command("wsl")
        .args(["-d", distro, "--", "echo", "ready"])
        .output()
        .await?;
    Ok(())
}
```

### Error Handling for WSL

```rust
// Common WSL errors and how to handle them

match run_wsl_command(&app, &["docker", "ps"]).await {
    Ok(output) => { /* success */ },
    Err(e) => {
        let error_msg = e.to_string();

        if error_msg.contains("not recognized") {
            // WSL not installed
            return Err("WSL is not installed. Please enable WSL2 in Windows Features.".into());
        }

        if error_msg.contains("not found") || error_msg.contains("no such distribution") {
            // Distribution not installed
            return Err("Ubuntu distribution not found. Please install from Microsoft Store.".into());
        }

        if error_msg.contains("not running") {
            // WSL not started
            return Err("WSL is not running. Starting it now...".into());
            // Then attempt to start it
        }

        if error_msg.contains("docker") && error_msg.contains("not found") {
            // Docker not installed in WSL
            return Err("Docker is not installed in WSL2. Please install Docker.".into());
        }

        // Unknown error
        Err(format!("WSL command failed: {}", e))
    }
}
```

### Testing WSL Integration

```rust
#[cfg(test)]
mod wsl_tests {
    use super::*;

    #[test]
    fn test_path_conversion() {
        assert_eq!(
            windows_to_wsl_path("C:\\Users\\test"),
            "/mnt/c/Users/test"
        );
    }

    // Integration tests should mock WSL on non-Windows platforms
    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn test_wsl_available() {
        // Only runs on Windows
        let status = check_wsl_status().await;
        assert!(status.is_ok());
    }
}
```

---

## Do's and Don'ts

### Do's
- Use Tauri's built-in APIs and plugins when available
- Validate all input on the Rust side
- Provide meaningful error messages for users
- Use TypeScript strict mode
- Follow the principle of least privilege
- Test on all target platforms (including Windows with WSL2)
- Use async/await for all I/O operations
- Implement proper cleanup on app exit
- **Use `docker compose` (v2)** not `docker-compose` (v1)
- **Always specify WSL distribution** with `-d` flag on Windows
- **Store OpenClaw data in WSL filesystem** for better performance on Windows
- **Convert paths appropriately** when crossing Windows/WSL boundary
- **Check for WSL availability** before attempting Docker commands on Windows
- **Handle Git operations** through the same platform abstraction as Docker

### Don'ts
- Don't use `unsafe` Rust without clear justification
- Don't store sensitive data in plaintext
- Don't execute arbitrary shell commands
- Don't trust frontend-provided paths
- Don't block the main thread with sync I/O
- Don't log sensitive information
- Don't hardcode configuration values
- Don't skip error handling
- **Don't use `docker-compose` (v1)** - it's deprecated
- **Don't assume Docker is available natively** on Windows - always go through WSL
- **Don't use raw `wsl` command** without specifying distribution
- **Don't mix Windows and WSL paths** without proper conversion
- **Don't assume Git is available** - always check first

---

## Useful References

- [Tauri v2 Documentation](https://v2.tauri.app)
- [Tauri Plugin Shell](https://v2.tauri.app/plugin/shell/)
- [Tauri Plugin FS](https://v2.tauri.app/plugin/file-system/)
- [Tauri Security Best Practices](https://v2.tauri.app/security/)
- [React Documentation](https://react.dev)
- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [shadcn/ui Components](https://ui.shadcn.com)
- [React Bits](https://reactbits.dev) - Animated UI components

---

## React Bits Components

This project uses [React Bits](https://reactbits.dev) for animated UI components. React Bits provides a collection of high-quality, animated, interactive React components.

### Configuration

The project has a `components.json` configured with the React Bits registry:

```json
{
  "registries": {
    "@reactbits": {
      "url": "https://reactbits.dev/r/{name}.json"
    }
  }
}
```

### Installing Components

Use the shadcn CLI with bun to install components:

```bash
# Install a component from React Bits
bun x --bun shadcn@latest add "@reactbits/ComponentName-TS-TW" --yes

# Examples:
bun x --bun shadcn@latest add "@reactbits/GradientText-TS-TW" --yes
bun x --bun shadcn@latest add "@reactbits/Aurora-TS-TW" --yes
bun x --bun shadcn@latest add "@reactbits/Particles-TS-TW" --yes
```

### Component Naming Convention

React Bits components have variants based on language and styling:

| Suffix | Description |
|--------|-------------|
| `-TS-TW` | TypeScript + Tailwind CSS (recommended) |
| `-TS-CSS` | TypeScript + CSS-in-JS |
| `-JS-TW` | JavaScript + Tailwind CSS |
| `-JS-CSS` | JavaScript + CSS-in-JS |

**Always use `-TS-TW` variants** for this project as we use TypeScript and Tailwind.

### Dependencies

Most React Bits components require the `motion` library (Framer Motion):

```bash
bun add motion
```

This is already installed in the project.

### Usage Example

```typescript
import GradientText from "@/components/GradientText";

function MyComponent() {
  return (
    <GradientText
      className="text-xl font-semibold"
      colors={["#7C3AED", "#A855F7", "#C084FC"]}
      animationSpeed={5}
    >
      Animated Text
    </GradientText>
  );
}
```

### Available Component Categories

React Bits offers components in several categories:
- **Text Animations**: GradientText, DecryptedText, GlitchText, ShinyText, etc.
- **Backgrounds**: Aurora, Particles, Silk, Waves, Hyperspeed, etc.
- **Components**: Cards, Menus, Galleries, etc.
- **Animations**: Cursors, Transitions, Effects, etc.

Browse all components at [reactbits.dev](https://reactbits.dev).

### Best Practices

1. **Always install via CLI** - Don't copy-paste code manually
2. **Use TS-TW variants** - Consistent with project standards
3. **Check dependencies** - Some components require additional packages
4. **Test animations** - Ensure they work well with the app's theme
5. **Accessibility** - Verify animations respect `prefers-reduced-motion`

---

## Iteration Checklist

Before completing each iteration:
1. [ ] Code follows the patterns in this document
2. [ ] All new commands have proper error handling
3. [ ] Security checklist items are addressed
4. [ ] Tests are written for new functionality
5. [ ] Documentation is updated if needed
6. [ ] **`bun check:fix` passes with no lint errors**
7. [ ] No TypeScript or Rust compiler warnings
8. [ ] Tested on at least one platform
9. [ ] User-facing strings are clear and helpful
10. [ ] **Path handling works on both Windows (WSL) and Unix**
11. [ ] **Docker Compose commands tested with v2**
12. [ ] **Git operations tested through platform abstraction**
13. [ ] **Windows testing includes WSL2 integration** (if applicable)

## Build Verification (MANDATORY)

**IMPORTANT**: Before finishing any task, ALWAYS run these commands to verify the build is successful:

```bash
# 1. Verify lint and formatting (Biome)
bun check:fix

# 2. Verify frontend build (TypeScript + Vite)
bun run build

# 3. Verify Rust code compiles (quick check)
cd src-tauri && cargo check

# 4. Verify full Tauri build (Rust + Frontend) - for release
bun run tauri build
```

**Rules:**
- Never mark a task as complete if any of the above commands fail
- Fix all lint errors before proceeding (do NOT modify biome.json rules to suppress errors)
- Fix all TypeScript errors before proceeding
- Fix all Rust compilation errors before proceeding
- If build fails due to environment issues (missing system libs), document it clearly
- Run `bunx tsc --noEmit` for quick TypeScript-only check during development

### System Requirements for Building

**Linux** requires these packages for Tauri to compile:
```bash
sudo apt-get install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

**macOS** requires:
```bash
xcode-select --install
```

**Windows** requires:
- Visual Studio Build Tools with C++ workload
- WebView2 (usually pre-installed on Windows 10/11)

If system dependencies are unavailable, at minimum verify:
1. `bun check:fix` passes with no errors (lint)
2. `bun run build` succeeds (frontend)
3. `cargo check` reports only system library errors, not code errors
