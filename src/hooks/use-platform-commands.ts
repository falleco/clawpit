import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

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

export function usePlatformCommands() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCurrentPlatform = useCallback(async (): Promise<
    'windows' | 'macos' | 'linux'
  > => {
    try {
      const result = await invoke<string>('get_current_platform');
      return result as 'windows' | 'macos' | 'linux';
    } catch {
      return 'linux'; // fallback
    }
  }, []);

  const isWindows = useCallback(async (): Promise<boolean> => {
    try {
      const result = await invoke<boolean>('is_windows');
      return result;
    } catch {
      return false;
    }
  }, []);

  const checkWslInstalled = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<boolean>('check_wsl_installed');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getWslDistros = useCallback(async (): Promise<WslDistro[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<WslDistro[]>('get_wsl_distros');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDefaultWslDistro = useCallback(async (): Promise<string | null> => {
    try {
      const result = await invoke<string | null>('get_default_wsl_distro');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    }
  }, []);

  const setDefaultWslDistro = useCallback(
    async (name: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke('set_default_wsl_distro', { name });
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

  const setWslDistro = useCallback(async (distro: string): Promise<boolean> => {
    try {
      await invoke('set_wsl_distro', { distro });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return false;
    }
  }, []);

  const getWslStatus = useCallback(async (): Promise<WslStatus | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<WslStatus>('get_wsl_status');
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
    getCurrentPlatform,
    isWindows,
    checkWslInstalled,
    getWslDistros,
    getDefaultWslDistro,
    setDefaultWslDistro,
    setWslDistro,
    getWslStatus,
  };
}
