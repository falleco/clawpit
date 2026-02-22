import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

// Types
export interface ProviderConfig {
  whatsapp: boolean;
  telegram: { enabled: boolean; token: string };
  discord: { enabled: boolean; token: string };
}

export interface InstanceConfig {
  id: string;
  name: string;
  description: string;
  gatewayPort: number;
  bridgePort: number;
  bindMode: 'local' | 'lan';
  authToken: string;
  tokenGenerated: boolean;
  providers: ProviderConfig;
}

export interface ClawpitInstance {
  id: string;
  name: string;
  description: string;
  gatewayPort: number;
  bridgePort: number;
  bindMode: 'local' | 'lan';
  authToken: string;
  tokenGenerated: boolean;
  providers: ProviderConfig;
  path: string;
  createdAt: string;
  lastUsedAt?: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';
}

export interface InstanceUpdate {
  name?: string;
  description?: string;
  gatewayPort?: number;
  bridgePort?: number;
  bindMode?: 'local' | 'lan';
  authToken?: string;
  providers?: ProviderConfig;
}

export interface SuggestedPorts {
  gatewayPort: number;
  bridgePort: number;
}

export interface ContainerDetails {
  name: string;
  state: string;
  health?: string;
  runningFor?: string;
  ports: string[];
  cpuPercent?: number;
  memoryMb?: number;
  memoryLimitMb?: number;
}

export interface ExtendedInstanceStatus {
  instanceId: string;
  instanceName: string;
  status: ClawpitInstance['status'];
  containers: ContainerDetails[];
  error?: string;
}

interface InstanceState {
  // State
  instances: ClawpitInstance[];
  activeInstanceId: string | null;
  isLoading: boolean;
  error: string | null;
  clawpitDir: string | null;

  // Computed
  activeInstance: ClawpitInstance | null;

  // Actions
  setClawpitDir: (dir: string) => void;
  loadInstances: () => Promise<void>;
  createInstance: (config: InstanceConfig) => Promise<ClawpitInstance>;
  updateInstance: (
    id: string,
    updates: InstanceUpdate,
  ) => Promise<ClawpitInstance>;
  deleteInstance: (id: string) => Promise<void>;
  setActiveInstance: (id: string) => void;
  getNextAvailablePorts: () => Promise<SuggestedPorts>;
  refreshInstanceStatus: (id: string) => Promise<void>;

  // Instance actions
  startInstance: (id: string) => Promise<void>;
  stopInstance: (id: string) => Promise<void>;
  restartInstance: (id: string) => Promise<void>;
  getInstanceLogs: (id: string, lines?: number) => Promise<string>;

  // Service management
  pullInstanceUpdates: (id: string) => Promise<string>;
  getInstanceExtendedStatus: (id: string) => Promise<ExtendedInstanceStatus>;
  startAllInstances: () => Promise<string[]>;
  stopAllInstances: () => Promise<string[]>;
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  // Initial state
  instances: [],
  activeInstanceId: null,
  isLoading: false,
  error: null,
  clawpitDir: null,

  // Computed getters
  get activeInstance() {
    const state = get();
    return state.instances.find((i) => i.id === state.activeInstanceId) || null;
  },

  // Actions
  setClawpitDir: (dir) => {
    set({ clawpitDir: dir });
  },

  loadInstances: async () => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      set({ error: 'Clawpit directory not set' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const instances = await invoke<ClawpitInstance[]>('list_instances', {
        clawpitDir,
        wslDistro: null, // Will use default WSL distro on Windows
      });

      // Transform the response to include flattened config
      const transformedInstances = instances.map((inst) => ({
        ...inst,
        id:
          (inst as unknown as { config: InstanceConfig }).config?.id || inst.id,
        name:
          (inst as unknown as { config: InstanceConfig }).config?.name ||
          inst.name,
        description:
          (inst as unknown as { config: InstanceConfig }).config?.description ||
          inst.description ||
          '',
        gatewayPort:
          (inst as unknown as { config: InstanceConfig }).config?.gatewayPort ||
          inst.gatewayPort,
        bridgePort:
          (inst as unknown as { config: InstanceConfig }).config?.bridgePort ||
          inst.bridgePort,
        bindMode:
          (inst as unknown as { config: InstanceConfig }).config?.bindMode ||
          inst.bindMode,
        authToken:
          (inst as unknown as { config: InstanceConfig }).config?.authToken ||
          inst.authToken ||
          '',
        tokenGenerated:
          (inst as unknown as { config: InstanceConfig }).config
            ?.tokenGenerated ||
          inst.tokenGenerated ||
          false,
        providers: (inst as unknown as { config: InstanceConfig }).config
          ?.providers ||
          inst.providers || {
            whatsapp: false,
            telegram: { enabled: false, token: '' },
            discord: { enabled: false, token: '' },
          },
      }));

      // Set active instance if not set
      const activeId = get().activeInstanceId;

      set({
        instances: transformedInstances,
        isLoading: false,
        activeInstanceId: activeId || transformedInstances[0]?.id || null,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  createInstance: async (config) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    try {
      const instance = await invoke<ClawpitInstance>('create_instance', {
        clawpitDir,
        config,
      });

      // Reload instances to get fresh list
      await get().loadInstances();

      return instance;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set({ error });
      throw new Error(error);
    }
  },

  updateInstance: async (id, updates) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    try {
      const instance = await invoke<ClawpitInstance>('update_instance', {
        clawpitDir,
        instanceId: id,
        updates,
      });

      // Update local state
      set((state) => ({
        instances: state.instances.map((i) =>
          i.id === id ? { ...i, ...updates } : i,
        ),
      }));

      return instance;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set({ error });
      throw new Error(error);
    }
  },

  deleteInstance: async (id) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    try {
      await invoke('delete_instance', {
        clawpitDir,
        instanceId: id,
      });

      // Update local state
      set((state) => ({
        instances: state.instances.filter((i) => i.id !== id),
        activeInstanceId:
          state.activeInstanceId === id
            ? state.instances.find((i) => i.id !== id)?.id || null
            : state.activeInstanceId,
      }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set({ error });
      throw new Error(error);
    }
  },

  setActiveInstance: (id) => {
    set({ activeInstanceId: id });
  },

  getNextAvailablePorts: async () => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    return invoke<SuggestedPorts>('get_next_available_ports', { clawpitDir });
  },

  refreshInstanceStatus: async (id) => {
    const { clawpitDir } = get();
    if (!clawpitDir) return;

    try {
      const status = await invoke<string>('get_instance_status', {
        clawpitDir,
        instanceId: id,
        wslDistro: null, // Will use stored WSL distro on Windows
      });

      set((state) => ({
        instances: state.instances.map((i) =>
          i.id === id
            ? { ...i, status: status as ClawpitInstance['status'] }
            : i,
        ),
      }));
    } catch (err) {
      console.error('Failed to refresh instance status:', err);
    }
  },

  startInstance: async (id) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      set({ error: 'Clawpit directory not set' });
      return;
    }

    // Set starting state
    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === id ? { ...i, status: 'starting' as const } : i,
      ),
      error: null,
    }));

    try {
      await invoke('start_instance', {
        clawpitDir,
        instanceId: id,
        wslDistro: null, // Will use stored WSL distro on Windows
      });

      // Update to running status
      set((state) => ({
        instances: state.instances.map((i) =>
          i.id === id ? { ...i, status: 'running' as const } : i,
        ),
      }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set((state) => ({
        instances: state.instances.map((i) =>
          i.id === id ? { ...i, status: 'error' as const } : i,
        ),
        error,
      }));
    }
  },

  stopInstance: async (id) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      set({ error: 'Clawpit directory not set' });
      return;
    }

    // Set stopping state
    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === id ? { ...i, status: 'stopping' as const } : i,
      ),
      error: null,
    }));

    try {
      await invoke('stop_instance', {
        clawpitDir,
        instanceId: id,
        wslDistro: null, // Will use stored WSL distro on Windows
      });

      // Update to stopped status
      set((state) => ({
        instances: state.instances.map((i) =>
          i.id === id ? { ...i, status: 'stopped' as const } : i,
        ),
      }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set((state) => ({
        instances: state.instances.map((i) =>
          i.id === id ? { ...i, status: 'error' as const } : i,
        ),
        error,
      }));
    }
  },

  restartInstance: async (id) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      set({ error: 'Clawpit directory not set' });
      return;
    }

    // Set transitioning state
    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === id ? { ...i, status: 'stopping' as const } : i,
      ),
      error: null,
    }));

    try {
      await invoke('restart_instance', {
        clawpitDir,
        instanceId: id,
        wslDistro: null, // Will use stored WSL distro on Windows
      });

      // Update to running status
      set((state) => ({
        instances: state.instances.map((i) =>
          i.id === id ? { ...i, status: 'running' as const } : i,
        ),
      }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set((state) => ({
        instances: state.instances.map((i) =>
          i.id === id ? { ...i, status: 'error' as const } : i,
        ),
        error,
      }));
    }
  },

  getInstanceLogs: async (id, lines = 100) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    return invoke<string>('get_instance_logs', {
      clawpitDir,
      instanceId: id,
      wslDistro: null,
      lines,
    });
  },

  pullInstanceUpdates: async (id) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    return invoke<string>('pull_instance_updates', {
      clawpitDir,
      instanceId: id,
      wslDistro: null,
    });
  },

  getInstanceExtendedStatus: async (id) => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    return invoke<ExtendedInstanceStatus>('get_instance_extended_status', {
      clawpitDir,
      instanceId: id,
      wslDistro: null,
    });
  },

  startAllInstances: async () => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    // Set all to starting
    set((state) => ({
      instances: state.instances.map((i) => ({
        ...i,
        status: 'starting' as const,
      })),
      error: null,
    }));

    try {
      const result = await invoke<string[]>('start_all_instances', {
        clawpitDir,
        wslDistro: null,
      });

      // Update status for started instances
      set((state) => ({
        instances: state.instances.map((i) =>
          result.includes(i.id) ? { ...i, status: 'running' as const } : i,
        ),
      }));

      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set({ error });
      // Reload instances to get actual status
      await get().loadInstances();
      throw new Error(error);
    }
  },

  stopAllInstances: async () => {
    const { clawpitDir } = get();
    if (!clawpitDir) {
      throw new Error('Clawpit directory not set');
    }

    // Set all to stopping
    set((state) => ({
      instances: state.instances.map((i) => ({
        ...i,
        status: 'stopping' as const,
      })),
      error: null,
    }));

    try {
      const result = await invoke<string[]>('stop_all_instances', {
        clawpitDir,
        wslDistro: null,
      });

      // Update status for stopped instances
      set((state) => ({
        instances: state.instances.map((i) =>
          result.includes(i.id) ? { ...i, status: 'stopped' as const } : i,
        ),
      }));

      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set({ error });
      // Reload instances to get actual status
      await get().loadInstances();
      throw new Error(error);
    }
  },
}));
