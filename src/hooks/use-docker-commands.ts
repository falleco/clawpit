import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

export interface DependencyStatus {
  installed: boolean;
  running?: boolean;
  version?: string;
  error?: string;
}

export interface CommandOutput {
  success: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
}

export function useDockerCommands() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkDockerInstalled =
    useCallback(async (): Promise<DependencyStatus> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<DependencyStatus>('check_docker_installed');
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { installed: false, error: message };
      } finally {
        setIsLoading(false);
      }
    }, []);

  const checkDockerRunning =
    useCallback(async (): Promise<DependencyStatus> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<DependencyStatus>('check_docker_running');
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { installed: false, running: false, error: message };
      } finally {
        setIsLoading(false);
      }
    }, []);

  const getDockerVersion = useCallback(async (): Promise<string | null> => {
    try {
      const result = await invoke<string>('get_docker_version');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    }
  }, []);

  const checkDockerCompose =
    useCallback(async (): Promise<DependencyStatus> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<DependencyStatus>('check_docker_compose');
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { installed: false, error: message };
      } finally {
        setIsLoading(false);
      }
    }, []);

  const runDockerCompose = useCallback(
    async (args: string[], workingDir?: string): Promise<CommandOutput> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<CommandOutput>('run_docker_compose', {
          args,
          workingDir,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { success: false, stdout: '', stderr: message };
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const getPlatform = useCallback(async (): Promise<string> => {
    try {
      const result = await invoke<string>('get_platform');
      return result;
    } catch {
      return 'unknown';
    }
  }, []);

  return {
    isLoading,
    error,
    checkDockerInstalled,
    checkDockerRunning,
    getDockerVersion,
    checkDockerCompose,
    runDockerCompose,
    getPlatform,
  };
}
