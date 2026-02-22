import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

export interface DependencyStatus {
  installed: boolean;
  running?: boolean;
  version?: string;
  error?: string;
}

export interface WslDistro {
  name: string;
  isDefault: boolean;
  wslVersion: number;
  state: string;
}

export interface WslStatus {
  installed: boolean;
  isWsl2: boolean;
  distributions: WslDistro[];
  defaultDistro?: string;
  error?: string;
}

export interface DiskSpaceInfo {
  availableGb: number;
  totalGb: number;
  sufficient: boolean;
  path: string;
}

export interface PrerequisiteError {
  code: string;
  message: string;
  suggestion?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PrerequisiteStatus {
  platform: 'windows' | 'macos' | 'linux';
  wslStatus?: WslStatus;
  docker: DependencyStatus;
  dockerCompose: DependencyStatus;
  git: DependencyStatus;
  network: {
    reachable: boolean;
    endpoint: string;
    latencyMs?: number;
    error?: string;
  };
  diskSpace: DiskSpaceInfo;
  allPassed: boolean;
  errors: PrerequisiteError[];
  timestamp: string;
}

export interface ServiceStatus {
  exists: boolean;
  state:
    | 'running'
    | 'stopped'
    | 'starting'
    | 'stopping'
    | 'restarting'
    | 'paused'
    | 'dead'
    | 'unknown';
  health?: string;
  uptime?: string;
  ports: Array<{
    containerPort: number;
    hostPort: number;
    protocol: string;
  }>;
  error?: string;
}

interface StatusState {
  // Prerequisites
  prerequisites: PrerequisiteStatus | null;
  prerequisitesLoading: boolean;
  prerequisitesError: string | null;

  // Service status
  service: ServiceStatus | null;
  serviceLoading: boolean;
  serviceError: string | null;

  // Polling
  isPolling: boolean;
  pollInterval: number;

  // Actions
  checkPrerequisites: () => Promise<PrerequisiteStatus | null>;
  checkServiceStatus: () => Promise<ServiceStatus | null>;
  startPolling: () => void;
  stopPolling: () => void;
  reset: () => void;
}

export const useStatusStore = create<StatusState>()((set, get) => {
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  return {
    prerequisites: null,
    prerequisitesLoading: false,
    prerequisitesError: null,

    service: null,
    serviceLoading: false,
    serviceError: null,

    isPolling: false,
    pollInterval: 10000,

    checkPrerequisites: async () => {
      set({ prerequisitesLoading: true, prerequisitesError: null });
      try {
        const result = await invoke<PrerequisiteStatus>('check_prerequisites');
        set({ prerequisites: result, prerequisitesLoading: false });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ prerequisitesError: message, prerequisitesLoading: false });
        return null;
      }
    },

    checkServiceStatus: async () => {
      set({ serviceLoading: true, serviceError: null });
      try {
        const result = await invoke<ServiceStatus>('get_gateway_status');
        set({ service: result, serviceLoading: false });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ serviceError: message, serviceLoading: false });
        return null;
      }
    },

    startPolling: () => {
      if (pollTimer) return;

      set({ isPolling: true });
      // Initial check
      get().checkServiceStatus();

      pollTimer = setInterval(() => {
        get().checkServiceStatus();
      }, get().pollInterval);
    },

    stopPolling: () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      set({ isPolling: false });
    },

    reset: () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      set({
        prerequisites: null,
        prerequisitesLoading: false,
        prerequisitesError: null,
        service: null,
        serviceLoading: false,
        serviceError: null,
        isPolling: false,
      });
    },
  };
});
