import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

export interface AppConfig {
  openclawDir: string;
  workspaceDir: string;
  wslDistro?: string;
  network: {
    gatewayPort: number;
    bridgePort: number;
    bindMode: 'local' | 'lan';
  };
  auth: {
    tokenEnabled: boolean;
    token?: string;
  };
  preferences: {
    startOnBoot: boolean;
    minimizeToTray: boolean;
    startMinimized: boolean;
    notificationsEnabled: boolean;
    autoRestart: boolean;
    theme: 'light' | 'dark' | 'system';
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    debugMode: boolean;
  };
}

export interface DefaultPaths {
  configDir: string;
  workspaceDir: string;
  windowsUncPath?: string;
}

export interface DirectoryStatus {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  writable: boolean;
}

export function useConfigCommands() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getConfig = useCallback(async (): Promise<AppConfig | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<AppConfig>('get_config');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveConfig = useCallback(
    async (config: AppConfig): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke('save_config', { config });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const getDefaultPaths =
    useCallback(async (): Promise<DefaultPaths | null> => {
      try {
        const result = await invoke<DefaultPaths>('get_default_paths');
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      }
    }, []);

  const validateConfig = useCallback(
    async (config: AppConfig): Promise<boolean> => {
      try {
        await invoke('validate_config', { config });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return false;
      }
    },
    [],
  );

  const resetConfig = useCallback(async (): Promise<AppConfig | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<AppConfig>('reset_config');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkDirectory = useCallback(
    async (path: string): Promise<DirectoryStatus | null> => {
      try {
        const result = await invoke<DirectoryStatus>('check_directory', {
          path,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      }
    },
    [],
  );

  const createDirectory = useCallback(
    async (path: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke('create_directory', { path });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return {
    isLoading,
    error,
    getConfig,
    saveConfig,
    getDefaultPaths,
    validateConfig,
    resetConfig,
    checkDirectory,
    createDirectory,
  };
}
