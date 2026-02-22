import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NetworkConfig {
  gatewayPort: number;
  bridgePort: number;
  bindMode: 'local' | 'lan';
}

export interface AuthConfig {
  tokenEnabled: boolean;
  token?: string;
}

export interface AppPreferences {
  startOnBoot: boolean;
  minimizeToTray: boolean;
  startMinimized: boolean;
  notificationsEnabled: boolean;
  autoRestart: boolean;
  theme: 'light' | 'dark' | 'system';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  debugMode: boolean;
}

export interface AppConfig {
  openclawDir: string;
  workspaceDir: string;
  wslDistro?: string;
  network: NetworkConfig;
  auth: AuthConfig;
  preferences: AppPreferences;
}

export interface DefaultPaths {
  configDir: string;
  workspaceDir: string;
  windowsUncPath?: string;
}

interface ConfigState {
  config: AppConfig | null;
  defaultPaths: DefaultPaths | null;
  platform: 'windows' | 'macos' | 'linux' | null;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;

  // Actions
  loadConfig: () => Promise<AppConfig | null>;
  saveConfig: (config: AppConfig) => Promise<boolean>;
  updateConfig: (updates: Partial<AppConfig>) => Promise<boolean>;
  loadDefaultPaths: () => Promise<DefaultPaths | null>;
  detectPlatform: () => Promise<'windows' | 'macos' | 'linux'>;
  resetConfig: () => Promise<AppConfig | null>;
  setError: (error: string | null) => void;
}

const defaultConfig: AppConfig = {
  openclawDir: '',
  workspaceDir: '',
  network: {
    gatewayPort: 18789,
    bridgePort: 18790,
    bindMode: 'lan',
  },
  auth: {
    tokenEnabled: true,
  },
  preferences: {
    startOnBoot: false,
    minimizeToTray: true,
    startMinimized: false,
    notificationsEnabled: true,
    autoRestart: false,
    theme: 'dark',
    logLevel: 'info',
    debugMode: false,
  },
};

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      config: null,
      defaultPaths: null,
      platform: null,
      isLoading: false,
      error: null,
      isConfigured: false,

      loadConfig: async () => {
        set({ isLoading: true, error: null });
        try {
          const result = await invoke<AppConfig>('get_config');
          const isConfigured = !!(result.openclawDir && result.workspaceDir);
          set({ config: result, isLoading: false, isConfigured });
          return result;
        } catch {
          // If config doesn't exist, use defaults
          set({
            config: defaultConfig,
            error: null,
            isLoading: false,
            isConfigured: false,
          });
          return defaultConfig;
        }
      },

      saveConfig: async (config) => {
        set({ isLoading: true, error: null });
        try {
          await invoke('save_config', { config });
          const isConfigured = !!(config.openclawDir && config.workspaceDir);
          set({ config, isLoading: false, isConfigured });
          return true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          set({ error: message, isLoading: false });
          return false;
        }
      },

      updateConfig: async (updates) => {
        const current = get().config || defaultConfig;
        const newConfig = { ...current, ...updates };
        return get().saveConfig(newConfig);
      },

      loadDefaultPaths: async () => {
        try {
          const result = await invoke<DefaultPaths>('get_default_paths');
          set({ defaultPaths: result });
          return result;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          set({ error: message });
          return null;
        }
      },

      detectPlatform: async () => {
        try {
          const result = await invoke<string>('get_current_platform');
          const platform = result as 'windows' | 'macos' | 'linux';
          set({ platform });
          return platform;
        } catch {
          set({ platform: 'linux' });
          return 'linux';
        }
      },

      resetConfig: async () => {
        set({ isLoading: true, error: null });
        try {
          const result = await invoke<AppConfig>('reset_config');
          set({ config: result, isLoading: false, isConfigured: false });
          return result;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          set({ error: message, isLoading: false });
          return null;
        }
      },

      setError: (error) => {
        set({ error });
      },
    }),
    {
      name: 'clawpit-config',
      partialize: (state) => ({
        config: state.config,
        isConfigured: state.isConfigured,
        platform: state.platform,
      }),
    },
  ),
);
