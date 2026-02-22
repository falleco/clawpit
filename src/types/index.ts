// Platform types
export type Platform = 'windows' | 'macos' | 'linux' | 'unknown';

// Health status types
export interface HealthStatus {
  platform: Platform;
  wslRunning: boolean | null;
  dockerRunning: boolean;
  composeAvailable: boolean;
  containerStatus: ContainerStatus | null;
  timestamp: string;
}

export interface ContainerStatus {
  name: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead';
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  uptime?: number;
}

// Docker Compose types
export interface ComposeService {
  name: string;
  image: string;
  state: string;
  ports: string[];
}

// Log entry type
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

// Provider types
export interface Provider {
  id: string;
  name: string;
  type: 'whatsapp' | 'telegram' | 'discord';
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  config?: Record<string, unknown>;
}

// WSL types (Windows only)
export interface WslDistro {
  name: string;
  state: 'Running' | 'Stopped';
  version: 1 | 2;
  isDefault: boolean;
}

export interface WslStatus {
  installed: boolean;
  version: string | null;
  defaultDistro: string | null;
  distros: WslDistro[];
}

// Command result type
export interface CommandResult<T = string> {
  success: boolean;
  data?: T;
  error?: string;
}

// Core services status (egress proxy, networks)
export interface CoreServicesStatus {
  installed: boolean;
  running: boolean;
  egressHealthy: boolean;
  networksCreated: boolean;
}

// Container information
export interface ContainerInfo {
  id: string;
  name: string;
  state: string;
  hasErrors: boolean;
  restartCount: number;
  ipAddress?: string;
}

// Instance containers info
export interface InstanceContainersInfo {
  gateway: ContainerInfo | null;
  ingress: ContainerInfo | null;
}

// Egress proxy logs
export interface EgressLogEntry {
  time: string;
  domain: string;
  status: string;
  decision: 'approved' | 'refused';
  ip: string;
}

// Agent identity from OpenClaw config
export interface AgentIdentity {
  name: string;
  theme: string;
  emoji: string;
  avatar: string;
}

// Agent definition from OpenClaw config
export interface OpenClawAgent {
  id: string;
  name: string;
  identity: AgentIdentity;
  skills: string[];
  workspace: string;
  agentDir: string;
}

// Instance agents
export interface InstanceAgents {
  agents: OpenClawAgent[];
}

// Template types
export interface TemplateAgentIdentity {
  name: string;
  theme: string;
  emoji: string;
  avatar: string;
}

export interface AgentTools {
  profile: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  skills: string[];
  identity: TemplateAgentIdentity;
  tools: AgentTools;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  image?: string;
  members: TeamMember[];
}

export interface MemberAvatarInfo {
  id: string;
  name: string;
  role: string;
  emoji: string;
  avatar?: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  image?: string;
  memberCount: number;
  memberAvatars: MemberAvatarInfo[];
}
