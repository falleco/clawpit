# Clawpit Implementation Plan

> A Tauri desktop application to simplify OpenClaw management for non-technical users.

## Overview

This document outlines the implementation roadmap for Clawpit, a desktop application that provides:
- Guided setup wizard for OpenClaw via Docker
- Real-time monitoring of OpenClaw services
- Pre-configured recipes for agentic behaviors
- Easy-to-use management interface for non-technical users

## Architecture Requirements

### Platform Support
| Platform | Docker Runtime | Command Execution |
|----------|---------------|-------------------|
| **Windows** | WSL2 + Docker | Commands via `wsl` wrapper |
| **macOS** | Docker Desktop | Native commands |
| **Linux** | Docker Engine | Native commands |

### Core Dependencies
All platforms require:
- **Docker** (with Docker Compose v2 plugin)
- **Git** (for OpenClaw workspace operations)

### Windows WSL2 Architecture
On Windows, Clawpit runs as a native Windows application but executes Docker and Git commands inside WSL2:

```
┌─────────────────────────────────────────────────────────────┐
│                    Windows Host                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Clawpit (Tauri App)                     │   │
│  │  - Native Windows UI                                 │   │
│  │  - Configuration management                          │   │
│  │  - Health monitoring                                 │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │ wsl -d <distro> -- <command>       │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │                    WSL2                              │   │
│  │  - Docker Engine                                     │   │
│  │  - Docker Compose                                    │   │
│  │  - Git                                               │   │
│  │  - OpenClaw containers                               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

# Milestone 1: Foundation & Core Infrastructure

## 1.1 Project Configuration & Dependencies

**Objective**: Establish the core Tauri infrastructure with necessary plugins.

### Tasks:
1. Add required Tauri plugins to `src-tauri/Cargo.toml`:
   - `tauri-plugin-shell` - Execute Docker commands
   - `tauri-plugin-fs` - Read/write configuration files
   - `tauri-plugin-store` - Persist user preferences
   - `tauri-plugin-dialog` - File/folder selection dialogs
   - `tauri-plugin-notification` - System notifications for status changes
   - `tauri-plugin-process` - Process management for daemon monitoring

2. Configure plugin capabilities in `src-tauri/capabilities/default.json`:
   - Define shell command scopes for Docker operations
   - Set filesystem access permissions (scoped to config directories)
   - Enable notification permissions

3. Update `src-tauri/tauri.conf.json`:
   - Set appropriate window dimensions (1024x768 minimum)
   - Configure app identifier and metadata
   - Define bundle resources for embedded scripts

4. Install frontend dependencies:
   - `@tauri-apps/plugin-shell` - Shell command interface
   - `@tauri-apps/plugin-fs` - File system operations
   - `@tauri-apps/plugin-store` - Persistent storage
   - `@tauri-apps/plugin-dialog` - Native dialogs
   - `@tauri-apps/plugin-notification` - Notifications
   - State management library (Zustand recommended)
   - UI component library (shadcn/ui + Tailwind CSS)

## 1.2 Backend Command Architecture

**Objective**: Create the Rust command layer for system operations with cross-platform support.

### Tasks:
1. Create module structure in `src-tauri/src/`:
   ```
   src/
   ├── lib.rs           # Main entry, command registration
   ├── commands/
   │   ├── mod.rs       # Module exports
   │   ├── docker.rs    # Docker operations
   │   ├── git.rs       # Git operations
   │   ├── config.rs    # Configuration management
   │   ├── health.rs    # Health check commands
   │   ├── platform.rs  # Platform detection & WSL commands
   │   └── recipes.rs   # Recipe management
   ├── platform/
   │   ├── mod.rs       # Platform abstraction layer
   │   ├── windows.rs   # Windows + WSL2 implementation
   │   ├── macos.rs     # macOS implementation
   │   └── linux.rs     # Linux implementation
   └── models/
       ├── mod.rs       # Model exports
       ├── config.rs    # Configuration structs
       ├── status.rs    # Status/health structs
       └── recipe.rs    # Recipe definitions
   ```

2. **Implement platform abstraction layer**:
   ```rust
   // Platform-agnostic command execution
   pub trait CommandExecutor {
       async fn run_docker(&self, args: &[&str]) -> Result<Output, Error>;
       async fn run_docker_compose(&self, args: &[&str]) -> Result<Output, Error>;
       async fn run_git(&self, args: &[&str]) -> Result<Output, Error>;
   }

   // Windows implementation wraps commands with WSL
   // macOS/Linux implementations run commands directly
   ```

3. Implement core Docker commands:
   - `check_docker_installed` - Verify Docker availability
   - `check_docker_running` - Verify Docker daemon status
   - `get_docker_version` - Get Docker version info
   - `check_docker_compose` - Verify Docker Compose v2 availability (`docker compose` subcommand)

4. Implement Git commands:
   - `check_git_installed` - Verify Git availability
   - `get_git_version` - Get Git version info
   - `git_clone` - Clone OpenClaw repositories
   - `git_pull` - Update existing repositories

5. Implement configuration commands:
   - `get_config` - Load current configuration
   - `save_config` - Persist configuration changes
   - `get_default_paths` - Get platform-specific default paths
   - `validate_config` - Validate configuration values

6. **Windows-specific commands**:
   - `check_wsl_installed` - Verify WSL2 is available
   - `get_wsl_distros` - List available WSL distributions
   - `get_default_wsl_distro` - Get default WSL distribution
   - `set_wsl_distro` - Set preferred WSL distribution for commands

7. Define Serde-serializable models for all data structures

## 1.3 Frontend Architecture Setup

**Objective**: Establish scalable frontend architecture.

### Tasks:
1. Set up Tailwind CSS and shadcn/ui:
   - Install and configure Tailwind CSS
   - Initialize shadcn/ui components
   - Define color scheme (dark mode primary)

2. Create folder structure:
   ```
   src/
   ├── components/
   │   ├── ui/           # shadcn/ui components
   │   ├── layout/       # Layout components
   │   ├── wizard/       # Setup wizard components
   │   ├── dashboard/    # Dashboard components
   │   └── recipes/      # Recipe management components
   ├── hooks/            # Custom React hooks
   ├── stores/           # Zustand stores
   ├── lib/              # Utilities and helpers
   ├── types/            # TypeScript definitions
   └── pages/            # Page components
   ```

3. Create Zustand stores:
   - `useConfigStore` - Configuration state
   - `useStatusStore` - Service status state
   - `useRecipeStore` - Recipe management state
   - `useWizardStore` - Setup wizard state

4. Create Tauri command wrapper hooks:
   - `useDockerCommands` - Docker operation hooks
   - `useConfigCommands` - Configuration hooks
   - `useHealthCommands` - Health monitoring hooks

---

# Milestone 2: Prerequisites & Environment Detection

## 2.1 System Requirements Check

**Objective**: Detect and validate all system prerequisites with platform-specific logic.

### Prerequisites Matrix:
| Requirement | Windows | macOS | Linux |
|-------------|---------|-------|-------|
| WSL2 | Required | N/A | N/A |
| Docker | Via WSL2 | Docker Desktop | Docker Engine |
| Docker Compose | Via WSL2 (v2 plugin) | Docker Desktop | v2 plugin |
| Git | Via WSL2 | Xcode CLI / Homebrew | Package manager |
| Min Disk Space | 10GB (WSL2 vhdx) | 5GB | 5GB |

### Tasks:
1. Create `PrerequisitesChecker` component with categorized checks:

   **Windows-Specific Checks:**
   - WSL2 feature enabled
   - WSL2 distribution installed (Ubuntu recommended)
   - Docker Desktop installed OR Docker in WSL2
   - Docker Desktop WSL2 backend enabled (if using Docker Desktop)
   - Git available in WSL2

   **All Platforms:**
   - Docker installation status with version
   - Docker daemon running status
   - Docker Compose v2 availability (`docker compose version`)
   - Git installation status with version
   - Available disk space check
   - Network connectivity test

2. Implement Rust commands for each check:
   ```rust
   #[tauri::command]
   async fn check_prerequisites(app: AppHandle) -> Result<PrerequisiteStatus, String> {
       let platform = detect_platform();
       match platform {
           Platform::Windows => check_windows_prerequisites(&app).await,
           Platform::MacOS => check_macos_prerequisites(&app).await,
           Platform::Linux => check_linux_prerequisites(&app).await,
       }
   }

   #[derive(Serialize)]
   struct PrerequisiteStatus {
       platform: String,
       wsl_status: Option<WslStatus>,  // Windows only
       docker_installed: bool,
       docker_version: Option<String>,
       docker_running: bool,
       docker_compose_installed: bool,
       docker_compose_version: Option<String>,
       git_installed: bool,
       git_version: Option<String>,
       disk_space_gb: f64,
       disk_space_ok: bool,
       all_passed: bool,
       errors: Vec<PrerequisiteError>,
   }
   ```

3. Create visual status indicators:
   - Green checkmark for passed checks
   - Red X with actionable message for failures
   - Yellow warning for optional improvements
   - Loading spinner during checks
   - "Retry" button for failed checks
   - "Fix" button with guided resolution

4. Add platform-specific Docker installation guides:
   - **macOS**: Link to Docker Desktop download
   - **Windows**:
     1. Enable WSL2 feature
     2. Install Ubuntu from Microsoft Store
     3. Option A: Install Docker Desktop (recommended for beginners)
     4. Option B: Install Docker directly in WSL2 (advanced)
   - **Linux**: Distribution-specific instructions (apt, dnf, pacman)

## 2.2 Windows WSL2 Setup Assistance

**Objective**: Guide Windows users through WSL2 configuration.

### Tasks:
1. Create `WSL2SetupWizard` component:
   - Check if WSL feature is enabled
   - Guide through enabling WSL2 (requires admin)
   - Recommend and install Ubuntu distribution
   - Configure WSL2 as default version
   - Verify successful installation

2. Implement WSL2 detection commands:
   ```rust
   #[tauri::command]
   async fn check_wsl_status() -> Result<WslStatus, String> {
       // Run: wsl --status
       // Parse output for WSL version, default distro, etc.
   }

   #[tauri::command]
   async fn list_wsl_distros() -> Result<Vec<WslDistro>, String> {
       // Run: wsl --list --verbose
       // Parse and return distro list with status
   }

   #[tauri::command]
   async fn set_default_wsl_distro(name: String) -> Result<(), String> {
       // Run: wsl --set-default <name>
   }
   ```

3. WSL2 configuration storage:
   - Store selected WSL distribution in app config
   - Allow changing distribution in settings
   - Validate distribution has required tools

4. Handle common WSL2 issues:
   - WSL1 vs WSL2 version mismatch
   - Distribution not running
   - Docker integration not enabled
   - Memory/resource limits

## 2.3 Docker Installation Assistance

**Objective**: Guide users through Docker installation and configuration.

### Tasks:
1. Create `DockerSetupWizard` component:
   - Platform-specific installation steps
   - Progress tracking for multi-step installs
   - Verification after each step

2. **Windows Docker Setup Flow:**
   ```
   Option A: Docker Desktop (Recommended)
   1. Download Docker Desktop installer
   2. Run installer
   3. Enable WSL2 backend in settings
   4. Verify: docker --version (in WSL2)

   Option B: Docker in WSL2 (Advanced)
   1. Open WSL2 terminal
   2. Install Docker via apt
   3. Configure Docker to start with WSL
   4. Add user to docker group
   5. Verify: docker --version
   ```

3. **macOS Docker Setup Flow:**
   ```
   1. Download Docker Desktop for Mac
   2. Drag to Applications
   3. Launch and complete setup
   4. Verify: docker --version
   ```

4. **Linux Docker Setup Flow:**
   ```
   1. Detect distribution (Ubuntu, Fedora, Arch, etc.)
   2. Show distribution-specific commands
   3. Guide through post-install (docker group)
   4. Verify: docker --version
   ```

5. Docker Compose verification:
   - Check for `docker compose` (v2, preferred)
   - Fall back to `docker-compose` (v1) with warning
   - Guide upgrade if v1 detected

## 2.4 Git Installation Assistance

**Objective**: Ensure Git is available for OpenClaw operations.

### Tasks:
1. Create `GitSetupGuide` component:
   - Platform-specific installation instructions
   - Version verification
   - Basic Git configuration (optional)

2. **Windows Git Setup:**
   - Git should be installed in WSL2, not Windows
   - Guide: `sudo apt install git` in WSL2 terminal
   - Verify via WSL: `wsl git --version`

3. **macOS Git Setup:**
   - Option A: Xcode Command Line Tools (`xcode-select --install`)
   - Option B: Homebrew (`brew install git`)

4. **Linux Git Setup:**
   - Distribution-specific package manager commands
   - Usually pre-installed on most distributions

## 2.5 Dependency Installation Assistance

**Objective**: Unified guidance for all missing dependencies.

### Tasks:
1. Create `InstallationGuide` component:
   - Step-by-step instructions with screenshots
   - Platform-specific content detection
   - "Check Again" button after each step
   - Progress persistence (resume where left off)

2. Implement detection for common issues:
   - Docker not in PATH
   - Docker daemon not started
   - Permission issues (Linux docker group)
   - WSL2 not enabled (Windows)
   - WSL2 distro not running
   - Docker Desktop not using WSL2 backend
   - Git not installed

3. Add "Open External Link" functionality:
   - Use `tauri-plugin-opener` for safe link opening
   - Track which links user has visited
   - Deep links to specific documentation sections

4. Error recovery guidance:
   - Common error messages and solutions
   - "Contact Support" option for unknown errors
   - Log collection for troubleshooting

---

# Milestone 3: Setup Wizard

## 3.1 Configuration Wizard UI

**Objective**: Create intuitive multi-step setup wizard.

### Tasks:
1. Design wizard flow:
   ```
   Step 1: Welcome & Prerequisites
   Step 2: Clawpit Directory Configuration (.clawpit root)
   Step 3: Instance Setup (create first instance or select existing)
   Step 4: Network Settings (per instance)
   Step 5: Authentication Setup (per instance)
   Step 6: Provider Configuration (optional, per instance)
   Step 7: Review & Confirm
   Step 8: Installation Progress
   Step 9: Completion & Next Steps
   ```

2. Create `WizardContainer` component:
   - Step indicator/progress bar
   - Navigation (Back/Next/Skip)
   - State persistence (resume interrupted setup)
   - Keyboard navigation support

3. Implement each wizard step as separate component:
   - `WelcomeStep` - Introduction and prerequisites check
   - `DirectoryStep` - Configure Clawpit root directory (.clawpit)
   - `InstanceStep` - Create/select OpenClaw instance
   - `NetworkStep` - Port and binding configuration (per instance)
   - `AuthStep` - Token generation/input (per instance)
   - `ProviderStep` - Optional provider setup (per instance)
   - `ReviewStep` - Summary before installation
   - `ProgressStep` - Real-time installation progress
   - `CompleteStep` - Success message and quick actions

## 3.2 Directory Configuration

**Objective**: Allow users to configure storage locations with platform-aware defaults, supporting multiple OpenClaw instances.

### Directory Structure:
```
.clawpit/                           # Root Clawpit configuration folder
├── config.json                     # Clawpit app configuration
├── settings.json                   # User preferences (theme, language, etc.)
├── instances/                      # OpenClaw instances directory
│   ├── default/                    # Default instance
│   │   ├── .env                    # Instance environment variables
│   │   ├── docker-compose.yml      # Docker Compose configuration
│   │   ├── docker-compose.extra.yml# Extra mounts/customizations
│   │   └── workspace/              # Instance workspace
│   ├── work/                       # Example: "work" instance
│   │   ├── .env
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.extra.yml
│   │   └── workspace/
│   └── personal/                   # Example: "personal" instance
│       ├── .env
│       ├── docker-compose.yml
│       ├── docker-compose.extra.yml
│       └── workspace/
└── logs/                           # Clawpit application logs
```

### Tasks:
1. Implement directory selection with platform awareness:

   **Default Paths by Platform:**
   | Platform | Clawpit Root | Instance Example |
   |----------|--------------|------------------|
   | Windows (WSL) | `/home/<user>/.clawpit` | `/home/<user>/.clawpit/instances/default` |
   | macOS | `~/.clawpit` | `~/.clawpit/instances/default` |
   | Linux | `~/.clawpit` | `~/.clawpit/instances/default` |

   **Windows Note**: Recommend WSL filesystem for performance. Show both:
   - WSL path: `/home/user/.clawpit`
   - Windows access: `\\wsl$\Ubuntu\home\user\.clawpit`

2. Directory picker implementation:
   - Use `tauri-plugin-dialog` for folder picker
   - **Windows**: Allow picking from Windows filesystem BUT warn about performance
   - Show default paths with "Change" button
   - Validate write permissions
   - Calculate and display available space
   - **Windows**: Show WSL disk usage separately from Windows drives

3. Configuration options:
   - `CLAWPIT_ROOT_DIR` - Root Clawpit configuration directory (`.clawpit`)
   - `CLAWPIT_INSTANCES_DIR` - Directory containing all instances (`instances/`)
   - Default instance name configuration
   - Extra mount points configuration (per instance)
   - **Windows**: WSL distribution selection (if multiple installed)

4. Instance management structure:
   - Each instance is a subdirectory under `instances/`
   - Instance names: alphanumeric with dashes/underscores only
   - Reserved names: `default`, `_template`
   - Instance-specific `.env` and `docker-compose.yml` files
   - Independent workspaces per instance

5. Create directory structure if it doesn't exist:
   - Ask for confirmation before creating
   - Handle permission errors gracefully
   - Create full directory tree on first run
   - **Windows**: Create via WSL command (`wsl mkdir -p`)

6. **Windows-specific guidance:**
   ```
   Recommended: Store data in WSL filesystem
   ✅ /home/user/.clawpit (Fast - native Linux filesystem)
   ⚠️ /mnt/c/Users/.clawpit (Slower - crosses filesystem boundary)

   You can access WSL files from Windows Explorer:
   \\wsl$\Ubuntu\home\user\.clawpit
   ```

7. Instance configuration model:
   ```typescript
   interface ClawpitInstance {
     id: string;              // Unique identifier (folder name)
     name: string;            // Display name
     description?: string;    // Optional description
     path: string;            // Full path to instance directory
     isDefault: boolean;      // Is this the default instance
     createdAt: string;       // ISO timestamp
     lastUsedAt?: string;     // Last time instance was started
     status: 'running' | 'stopped' | 'error' | 'unknown';
     config: InstanceConfig;  // Instance-specific configuration
   }

   interface InstanceConfig {
     gatewayPort: number;
     bridgePort: number;
     bindMode: 'local' | 'lan';
     authToken?: string;      // Encrypted reference
     providers: ProviderConfig[];
     extraMounts: string[];
   }
   ```

## 3.3 Instance Management

**Objective**: Enable users to create and manage multiple OpenClaw instances.

### Tasks:
1. Implement instance CRUD operations:
   ```rust
   #[tauri::command]
   async fn create_instance(
       name: String,
       description: Option<String>,
       config: InstanceConfig,
   ) -> Result<ClawpitInstance, String>

   #[tauri::command]
   async fn list_instances() -> Result<Vec<ClawpitInstance>, String>

   #[tauri::command]
   async fn get_instance(id: String) -> Result<ClawpitInstance, String>

   #[tauri::command]
   async fn update_instance(
       id: String,
       updates: InstanceUpdate,
   ) -> Result<ClawpitInstance, String>

   #[tauri::command]
   async fn delete_instance(id: String) -> Result<(), String>

   #[tauri::command]
   async fn set_default_instance(id: String) -> Result<(), String>
   ```

2. Create `InstanceManager` component:
   - List all instances with status indicators
   - Create new instance wizard
   - Edit instance configuration
   - Delete instance with confirmation
   - Set default instance
   - Quick actions (start/stop/restart)

3. Instance isolation:
   - Each instance has unique ports (auto-assign or user-defined)
   - Separate Docker Compose projects (prefixed with instance ID)
   - Independent authentication tokens
   - Isolated workspaces

4. Instance naming rules:
   - Valid characters: `a-z`, `0-9`, `-`, `_`
   - Length: 3-32 characters
   - Must start with letter
   - Reserved names: `default`, `_template`, `_backup`

5. Instance templates:
   - Create instance from template
   - Save instance as template
   - Built-in templates for common use cases

6. Port management for multiple instances:
   - Default port ranges per instance
   - Port conflict detection
   - Automatic port suggestion
   ```
   Instance 1 (default): 18789, 18790
   Instance 2 (work):    18791, 18792
   Instance 3 (personal):18793, 18794
   ```

## 3.4 Network Configuration

**Objective**: Configure network settings with sensible defaults (per instance).

### Tasks:
1. Port configuration UI:
   - Gateway port (default: 18789 + instance offset)
   - Bridge port (default: 18790 + instance offset)
   - Port availability check with visual feedback
   - Automatic suggestion if port is in use
   - Port conflict detection across instances

2. Binding mode selection:
   - "Local only" (127.0.0.1) - Recommended for personal use
   - "LAN" - Access from other devices
   - Clear explanation of security implications

3. Firewall guidance:
   - Detect if firewall might block ports
   - Provide platform-specific instructions

## 3.5 Authentication Configuration

**Objective**: Secure token-based authentication setup.

### Tasks:
1. Token generation options:
   - Auto-generate secure token (recommended)
   - Manual token input
   - Show/hide token toggle
   - Copy to clipboard button

2. Implement secure token generation in Rust:
   ```rust
   #[tauri::command]
   fn generate_secure_token() -> String
   ```

3. Token storage:
   - Use `tauri-plugin-store` for encrypted storage
   - Never log or display token in plain text in production

## 3.6 Provider Configuration (Optional)

**Objective**: Guide through optional provider setup (per instance).

### Tasks:
1. Create provider selection UI:
   - WhatsApp (QR code flow)
   - Telegram (bot token)
   - Discord (bot token)
   - Skip option prominently displayed

2. Provider-specific setup flows:
   - WhatsApp: Display QR code, wait for scan confirmation
   - Telegram: Bot token input with validation
   - Discord: Bot token input with validation

3. Provider status indication:
   - Connected/Not configured status
   - "Configure Later" option
   - Link to detailed documentation

## 3.7 Installation Execution

**Objective**: Execute OpenClaw Docker setup for selected instance with real-time feedback and cross-platform support.

### Tasks:
1. Generate configuration files for each instance:
   - Create `.env` file with instance settings
   - Generate `docker-compose.yml` from template
   - Create `docker-compose.extra.yml` if extra mounts needed
   - **Windows**: Files created in WSL2 filesystem (e.g., `\\wsl$\Ubuntu\home\user\.clawpit\instances\default`)

2. Execute Docker Compose commands in sequence:
   ```
   Step 1: Create configuration directory
   Step 2: Generate configuration files
   Step 3: Pull OpenClaw Docker image
           - docker compose pull
   Step 4: Build image (if custom packages needed)
           - docker compose build
   Step 5: Run onboarding (non-interactive mode)
           - docker compose run --rm openclaw-cli onboard \
               --gateway-bind lan \
               --token-auth \
               --no-install-daemon
   Step 6: Start gateway service
           - docker compose up -d openclaw-gateway
   Step 7: Wait for service to be healthy
           - docker compose ps --format json
   Step 8: Verify health check
           - docker compose exec openclaw-gateway node dist/index.js health
   ```

3. **Platform-specific command execution:**
   ```rust
   // Windows: Wrap all commands with WSL
   async fn run_docker_compose_windows(
       wsl_distro: &str,
       working_dir: &str,  // WSL path format
       args: &[&str],
   ) -> Result<Output, Error> {
       Command::new("wsl")
           .args(["-d", wsl_distro, "--cd", working_dir, "--", "docker", "compose"])
           .args(args)
           .output()
           .await
   }

   // macOS/Linux: Direct execution
   async fn run_docker_compose_native(
       working_dir: &Path,
       args: &[&str],
   ) -> Result<Output, Error> {
       Command::new("docker")
           .args(["compose"])
           .args(args)
           .current_dir(working_dir)
           .output()
           .await
   }
   ```

4. Real-time progress display:
   - Current step indicator with description
   - Log output streaming (sanitized - remove tokens)
   - Estimated progress percentage
   - Error handling with retry option
   - Cancel button with cleanup
   - "Show Details" toggle for verbose output

5. Implement Rust-side execution:
   - Use `tauri-plugin-shell` for command execution
   - Stream stdout/stderr to frontend via events
   - Handle interruption and cleanup
   - **Windows**: Convert paths between Windows and WSL formats

6. Path conversion utilities (Windows):
   ```rust
   // Convert Windows path to WSL path
   // C:\Users\name\.clawpit -> /mnt/c/Users/name/.clawpit
   fn windows_to_wsl_path(windows_path: &str) -> String

   // Convert WSL path to Windows path
   // /home/user/.clawpit -> \\wsl$\Ubuntu\home\user\.clawpit
   fn wsl_to_windows_path(wsl_path: &str, distro: &str) -> String
   ```

7. Rollback on failure:
   - Track completed steps
   - On failure, offer to rollback
   - Clean up partial installations
   - Remove created containers/volumes

---

# Milestone 4: Dashboard & Monitoring

## 4.1 Main Dashboard

**Objective**: Create central hub for OpenClaw management with multi-instance support.

### Tasks:
1. Design dashboard layout:
   - Instance selector (dropdown or tabs)
   - Service status card per instance (prominent)
   - Quick actions panel
   - Recent activity feed (filterable by instance)
   - Resource usage indicators (per instance)

2. Implement `DashboardPage` component:
   - Instance switcher with status indicators
   - Real-time status updates for selected instance
   - One-click start/stop/restart per instance
   - Quick access to logs (per instance)
   - Link to web interface (per instance)
   - "All Instances" overview mode

3. Create status polling mechanism:
   - Health check every 10 seconds
   - Visual indicator for connection state
   - Automatic reconnection attempts

## 4.2 Service Management

**Objective**: Enable full service lifecycle management via Docker Compose for each instance.

### Tasks:
1. Implement service commands using Docker Compose (instance-aware):
   ```rust
   #[tauri::command]
   async fn start_instance(app: AppHandle, instance_id: String) -> Result<(), String> {
       // docker compose -p clawpit-{instance_id} up -d openclaw-gateway
       let instance = get_instance_config(&instance_id)?;
       run_docker_compose_for_instance(&app, &instance, &["up", "-d", "openclaw-gateway"]).await
   }

   #[tauri::command]
   async fn stop_instance(app: AppHandle, instance_id: String) -> Result<(), String> {
       // docker compose -p clawpit-{instance_id} stop openclaw-gateway
       let instance = get_instance_config(&instance_id)?;
       run_docker_compose_for_instance(&app, &instance, &["stop", "openclaw-gateway"]).await
   }

   #[tauri::command]
   async fn restart_instance(app: AppHandle, instance_id: String) -> Result<(), String> {
       // docker compose -p clawpit-{instance_id} restart openclaw-gateway
       let instance = get_instance_config(&instance_id)?;
       run_docker_compose_for_instance(&app, &instance, &["restart", "openclaw-gateway"]).await
   }

   #[tauri::command]
   async fn get_instance_status(app: AppHandle, instance_id: String) -> Result<InstanceStatus, String> {
       // docker compose -p clawpit-{instance_id} ps --format json
       let instance = get_instance_config(&instance_id)?;
       let output = run_docker_compose_for_instance(&app, &instance, &["ps", "--format", "json"]).await?;
       parse_container_status(&output)
   }

   #[tauri::command]
   async fn get_all_instances_status(app: AppHandle) -> Result<Vec<InstanceStatus>, String> {
       // Get status for all configured instances
       let instances = list_instances()?;
       let mut statuses = Vec::new();
       for instance in instances {
           if let Ok(status) = get_instance_status(app.clone(), instance.id).await {
               statuses.push(status);
           }
       }
       Ok(statuses)
   }

   // Additional Docker Compose commands
   #[tauri::command]
   async fn pull_updates(app: AppHandle, instance_id: String) -> Result<(), String> {
       // docker compose -p clawpit-{instance_id} pull
       let instance = get_instance_config(&instance_id)?;
       run_docker_compose_for_instance(&app, &instance, &["pull"]).await
   }

   #[tauri::command]
   async fn view_instance_logs(app: AppHandle, instance_id: String, lines: u32) -> Result<String, String> {
       // docker compose -p clawpit-{instance_id} logs --tail <lines> openclaw-gateway
       let instance = get_instance_config(&instance_id)?;
       run_docker_compose_for_instance(&app, &instance, &["logs", "--tail", &lines.to_string(), "openclaw-gateway"]).await
   }
   ```

2. Create service control UI:
   - Instance selector (switch between instances)
   - Start/Stop/Restart buttons with confirmation (per instance)
   - Status indicator (running/stopped/starting/error/unhealthy)
   - Container health status
   - Uptime display
   - Resource usage (CPU, memory from `docker stats`)
   - "Pull Updates" button for new versions
   - Bulk actions: Start All, Stop All instances

3. Implement graceful shutdown:
   - Confirmation dialog before stopping
   - Progress indicator during shutdown
   - Timeout handling (force stop if needed)
   - Cleanup verification

4. **Windows-specific considerations:**
   - All commands routed through WSL2
   - Show WSL distribution in status
   - Handle WSL not running scenario
   - Offer to start WSL if stopped

## 4.3 Log Viewer

**Objective**: Provide accessible log viewing for troubleshooting.

### Tasks:
1. Create `LogViewer` component:
   - Real-time log streaming
   - Search/filter functionality
   - Log level filtering (info/warn/error)
   - Auto-scroll with pause option
   - Timestamp display toggle
   - Container selection (if multiple services)

2. Implement log commands using Docker Compose:
   ```rust
   #[tauri::command]
   async fn get_logs(app: AppHandle, lines: u32) -> Result<Vec<LogEntry>, String> {
       // docker compose logs --tail <lines> --timestamps openclaw-gateway
       let output = run_docker_compose(
           &app,
           &["logs", "--tail", &lines.to_string(), "--timestamps", "openclaw-gateway"]
       ).await?;
       parse_log_entries(&output)
   }

   #[tauri::command]
   async fn stream_logs(app: AppHandle, window: Window) -> Result<(), String> {
       // docker compose logs -f openclaw-gateway
       // Stream output to frontend via events
       let mut child = spawn_docker_compose(
           &app,
           &["logs", "-f", "--timestamps", "openclaw-gateway"]
       ).await?;

       // Forward stdout to frontend events
       tokio::spawn(async move {
           while let Some(line) = child.stdout.next_line().await? {
               window.emit("log-entry", parse_log_line(&line))?;
           }
       });
   }
   ```

3. Log export functionality:
   - Export to file (user-selected location)
   - Copy selection to clipboard
   - Sanitize sensitive information (tokens, passwords)
   - Include system info header for support

4. **Windows-specific:**
   - Log streaming through WSL maintains connection
   - Handle WSL restart/disconnection gracefully

## 4.4 Health Monitoring

**Objective**: Continuous health monitoring with alerts.

### Tasks:
1. Implement health check system:
   - Gateway connectivity
   - Docker container status
   - Memory/CPU usage thresholds
   - Disk space monitoring

2. Create notification system:
   - Use `tauri-plugin-notification` for alerts
   - Configurable notification preferences
   - Alert history in UI

3. Auto-recovery options:
   - Automatic restart on failure (optional)
   - Configurable retry attempts
   - Notification on auto-recovery

---

# Milestone 5: Recipe Management

## 5.1 Recipe Data Model

**Objective**: Define and implement recipe system architecture.

### Tasks:
1. Define recipe schema:
   ```typescript
   interface Recipe {
     id: string;
     name: string;
     description: string;
     category: string;
     difficulty: 'beginner' | 'intermediate' | 'advanced';
     providers: string[];
     configuration: Record<string, any>;
     instructions: string[];
     tags: string[];
   }
   ```

2. Create recipe storage:
   - Built-in recipes (bundled with app)
   - User-created recipes (stored locally)
   - Recipe import/export functionality

3. Implement recipe commands:
   ```rust
   #[tauri::command]
   async fn list_recipes() -> Result<Vec<Recipe>, String>

   #[tauri::command]
   async fn get_recipe(id: String) -> Result<Recipe, String>

   #[tauri::command]
   async fn apply_recipe(id: String) -> Result<(), String>
   ```

## 5.2 Recipe Browser

**Objective**: Create discoverable recipe browsing experience.

### Tasks:
1. Create `RecipeBrowser` component:
   - Grid/list view toggle
   - Category filtering
   - Search functionality
   - Difficulty indicators

2. Recipe card design:
   - Icon/thumbnail
   - Name and short description
   - Required providers badges
   - Difficulty level indicator
   - "Apply" quick action

3. Recipe categories:
   - Communication (WhatsApp, Telegram, Discord bots)
   - Automation (scheduled tasks, triggers)
   - Integration (external services)
   - Custom (user-created)

## 5.3 Recipe Detail & Application

**Objective**: Guide users through recipe application.

### Tasks:
1. Create `RecipeDetail` component:
   - Full description and use cases
   - Prerequisites check
   - Configuration options
   - Step-by-step application wizard

2. Recipe application flow:
   - Validate prerequisites
   - Collect required configuration
   - Apply configuration changes
   - Verify successful application
   - Show next steps

3. Recipe management:
   - Enable/disable recipes
   - View active recipes
   - Recipe conflict detection

## 5.4 Built-in Recipe Library

**Objective**: Provide useful pre-configured recipes.

### Tasks:
1. Create starter recipes:
   - "WhatsApp Assistant" - Basic WhatsApp bot setup
   - "Telegram Notifier" - Notification bot
   - "Discord Helper" - Discord integration
   - "Scheduled Tasks" - Cron-like automation
   - "Multi-Platform Sync" - Cross-platform messaging

2. Recipe documentation:
   - Detailed instructions for each recipe
   - Troubleshooting guides
   - Video tutorials (links to external)

3. Recipe bundling:
   - Include recipes in app bundle
   - Version recipes with app updates
   - Recipe update notification system

---

# Milestone 6: System Tray & Background Operation

## 6.1 System Tray Integration

**Objective**: Enable background operation with system tray.

### Tasks:
1. Configure system tray in Tauri:
   - App icon in system tray
   - Tray menu with quick actions
   - Status indicator in tray icon

2. Implement tray menu:
   - Show/Hide window
   - Quick status view
   - Start/Stop gateway
   - Open web interface
   - Quit application

3. Tray icon states:
   - Green: Running and healthy
   - Yellow: Starting/stopping
   - Red: Error or stopped
   - Gray: Not configured

## 6.2 Background Service Management

**Objective**: Manage OpenClaw as background service.

### Tasks:
1. Implement "Start on boot" option:
   - Platform-specific auto-start registration
   - Configuration option in settings

2. Window behavior options:
   - Minimize to tray on close
   - Start minimized option
   - Single instance enforcement

3. Background health monitoring:
   - Continue monitoring when minimized
   - Tray notifications for issues
   - Automatic window popup for critical errors

---

# Milestone 7: Settings & Configuration

## 7.1 Settings UI

**Objective**: Comprehensive settings management.

### Tasks:
1. Create `SettingsPage` component:
   - General settings
   - Network settings
   - Notification settings
   - Advanced settings

2. Settings categories:
   - **General**: Language, theme, start on boot
   - **Network**: Ports, binding, proxy settings
   - **Notifications**: Enable/disable, types
   - **Advanced**: Log level, debug mode, reset options

3. Settings persistence:
   - Use `tauri-plugin-store`
   - Import/export configuration
   - Reset to defaults option

## 7.2 Configuration Management

**Objective**: Safe configuration editing.

### Tasks:
1. Configuration editor:
   - Edit OpenClaw configuration
   - Validation before saving
   - Backup before changes
   - Restart prompt after changes

2. Environment variable management:
   - View current environment
   - Edit variables with descriptions
   - Reset individual variables

3. Docker Compose customization:
   - View current compose file
   - Edit extra mounts
   - Manage additional packages

---

# Milestone 8: Polish & Distribution

## 8.1 UI/UX Polish

**Objective**: Production-ready user experience.

### Tasks:
1. Loading states:
   - Skeleton loaders for all async content
   - Progress indicators for long operations
   - Graceful error states

2. Animations:
   - Subtle transitions between views
   - Status change animations
   - Micro-interactions for feedback

3. Accessibility:
   - Keyboard navigation
   - Screen reader support
   - High contrast mode support

4. Responsive design:
   - Minimum window size handling
   - Proper scaling at different sizes

## 8.2 Error Handling & Recovery

**Objective**: Robust error handling throughout.

### Tasks:
1. Error boundary implementation:
   - Catch and display errors gracefully
   - Recovery options where possible
   - Error reporting mechanism

2. Common error scenarios:
   - Docker not running
   - Network issues
   - Permission problems
   - Configuration corruption

3. Recovery procedures:
   - Automatic retry logic
   - Manual recovery wizard
   - Factory reset option

## 8.3 Documentation & Help

**Objective**: In-app help and documentation.

### Tasks:
1. Help system:
   - Contextual help tooltips
   - FAQ section
   - Troubleshooting guide

2. First-run experience:
   - Feature tour for new users
   - Tooltips highlighting key features
   - Skip option for experienced users

3. External documentation:
   - Link to full documentation
   - Link to community support
   - Link to issue reporting

## 8.4 Build & Distribution

**Objective**: Production builds for all platforms.

### Tasks:
1. Configure builds:
   - Windows installer (.msi, .exe)
   - macOS DMG and app bundle
   - Linux AppImage and .deb

2. Code signing:
   - Windows code signing certificate
   - macOS notarization
   - Linux package signing

3. Auto-update system:
   - Implement update checking
   - Background download
   - User notification for updates

4. CI/CD pipeline:
   - GitHub Actions for automated builds
   - Release automation
   - Version management

---

# Milestone 9: Testing & Quality Assurance

## 9.1 Unit Testing

### Tasks:
1. Rust backend tests:
   - Command unit tests
   - Model serialization tests
   - Configuration validation tests

2. Frontend tests:
   - Component unit tests (Vitest)
   - Hook tests
   - Store tests

## 9.2 Integration Testing

### Tasks:
1. Tauri integration tests:
   - Command integration tests
   - Plugin integration tests
   - IPC communication tests

2. E2E testing:
   - WebDriver-based tests
   - Critical path testing
   - Cross-platform testing

## 9.3 Manual Testing

### Tasks:
1. Test matrix:

   **Windows:**
   | Configuration | Docker Source | Git Source |
   |--------------|---------------|------------|
   | Windows 10 + WSL2 + Docker Desktop | Docker Desktop | WSL2 |
   | Windows 11 + WSL2 + Docker Desktop | Docker Desktop | WSL2 |
   | Windows 11 + WSL2 + Docker in WSL | WSL2 native | WSL2 |

   **macOS:**
   | Configuration | Docker Source | Git Source |
   |--------------|---------------|------------|
   | macOS 12 + Docker Desktop | Docker Desktop | Xcode CLI |
   | macOS 13 + Docker Desktop | Docker Desktop | Homebrew |
   | macOS 14 + Docker Desktop | Docker Desktop | Xcode CLI |

   **Linux:**
   | Configuration | Docker Source | Git Source |
   |--------------|---------------|------------|
   | Ubuntu 22.04 | Docker Engine | apt |
   | Ubuntu 24.04 | Docker Engine | apt |
   | Fedora 39/40 | Docker Engine | dnf |

2. Test scenarios:
   - Fresh installation (no prerequisites)
   - Prerequisites already installed
   - Upgrade from previous version
   - Error recovery
   - Edge cases
   - **Windows-specific:**
     - WSL not installed
     - WSL installed but no distribution
     - Docker Desktop not using WSL2 backend
     - Multiple WSL distributions
     - WSL distribution not running
   - **Docker Compose scenarios:**
     - v1 installed (should warn/upgrade)
     - v2 installed
     - Both v1 and v2 installed
   - **Git scenarios:**
     - Git not installed
     - Git installed but not configured
     - Repository operations (clone, pull)

---

# Implementation Priority Order

For efficient development, implement in this order:

1. **Core Foundation** (Milestone 1) - Required for everything else
2. **Prerequisites Detection** (Milestone 2) - Gate for setup
3. **Setup Wizard** (Milestone 3) - Primary user flow
4. **Dashboard** (Milestone 4) - Main interface after setup
5. **System Tray** (Milestone 6) - Background operation
6. **Settings** (Milestone 7) - Configuration management
7. **Recipes** (Milestone 5) - Advanced features
8. **Polish** (Milestone 8) - Production readiness
9. **Testing** (Milestone 9) - Quality assurance

---

# Technical Debt & Future Considerations

## Future Enhancements
- Remote management (manage OpenClaw on other machines)
- Recipe marketplace (community-contributed recipes)
- Advanced analytics dashboard
- Backup and restore functionality (per instance and global)
- Instance synchronization across devices
- Instance templates marketplace
- Native Windows Docker support (when Docker improves Windows containers)

## Known Limitations

### Windows
- **Requires WSL2**: Windows users must have WSL2 enabled and configured
- **WSL distribution required**: At least one Linux distribution must be installed
- **Path translation**: File paths must be translated between Windows and WSL formats
- **Performance**: File I/O between Windows and WSL filesystems can be slow (recommend keeping data in WSL filesystem)
- **Docker Desktop optional**: Users can use Docker Desktop OR Docker installed directly in WSL2
- **First-time WSL setup**: May require system restart after enabling WSL2 feature

### macOS
- Requires Docker Desktop (native Docker not available)
- Docker Desktop requires Apple Hypervisor framework

### Linux
- Docker group membership required for non-root execution
- Systemd or alternative init system needed for Docker daemon

### All Platforms
- Network binding options limited by Docker networking
- Some features require elevated permissions on first run
- Git must be installed for workspace operations
- Internet connection required for initial setup (Docker image pull)

## Security Considerations
- Token storage encryption via platform keychain
- Scoped filesystem access (only Clawpit directories: `.clawpit/`)
- Sandboxed shell command execution (only whitelisted commands)
- No sensitive data in logs (tokens sanitized)
- WSL commands scoped to specific distributions
- Git credentials managed by Git credential helpers (not stored by Clawpit)

## Windows WSL2 Architecture Notes

### Why WSL2?
- Docker on Windows runs best in WSL2 environment
- Linux containers require Linux kernel (provided by WSL2)
- Better performance than Hyper-V isolation
- Shared networking with Windows host

### Command Execution Flow
```
Clawpit (Windows)
    → wsl.exe -d Ubuntu -- docker compose up
        → WSL2 (Ubuntu)
            → Docker daemon
                → OpenClaw containers
```

### File System Recommendations
- **Store Clawpit data in WSL filesystem**: `/home/user/.clawpit`
- **Access from Windows**: `\\wsl$\Ubuntu\home\user\.clawpit`
- **Avoid Windows filesystem for Docker volumes**: Performance penalty with `/mnt/c/...`
- **Multiple instances**: Each instance has its own directory under `.clawpit/instances/`

### Networking
- WSL2 shares network with Windows host
- Ports exposed in Docker are accessible on `localhost` from Windows
- Firewall rules apply to both Windows and WSL2
