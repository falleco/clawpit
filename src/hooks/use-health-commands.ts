import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

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

export interface HealthStatus {
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

export interface GatewayStatus {
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

export function useHealthCommands() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPrerequisites =
    useCallback(async (): Promise<HealthStatus | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<HealthStatus>('check_prerequisites');
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    }, []);

  const getGatewayStatus =
    useCallback(async (): Promise<GatewayStatus | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<GatewayStatus>('get_gateway_status');
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    }, []);

  return {
    isLoading,
    error,
    checkPrerequisites,
    getGatewayStatus,
  };
}
