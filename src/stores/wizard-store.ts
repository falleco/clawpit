import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WizardStep =
  | 'welcome'
  | 'prerequisites'
  | 'instance'
  | 'network'
  | 'auth'
  | 'models'
  | 'providers'
  | 'review'
  | 'install'
  | 'complete';

export interface InstanceConfig {
  id: string;
  name: string;
  description: string;
  gatewayPort: number;
  bridgePort: number;
  bindMode: 'local' | 'lan';
  authToken: string;
  tokenGenerated: boolean;
  providers: {
    whatsapp: boolean;
    telegram: { enabled: boolean; token: string };
    discord: { enabled: boolean; token: string };
  };
}

export interface ModelConfig {
  openai: {
    enabled: boolean;
    authenticated: boolean;
  };
  anthropic: {
    enabled: boolean;
    authenticated: boolean;
  };
}

export interface TemplateMemberCommunication {
  discord?: string;
  telegram?: string;
  whatsapp?: string;
}

export interface TemplateMemberConfig {
  id: string;
  name: string;
  skills?: string[];
  plugins?: string[];
  communication?: TemplateMemberCommunication;
}

export interface WizardData {
  // Clawpit root directory
  clawpitDir: string;

  // Instance configuration
  instance: InstanceConfig;

  // AI Model configuration
  models: ModelConfig;

  // Windows-specific
  wslDistro: string;

  // Installation state
  isFirstRun: boolean;

  // Template configuration (optional)
  templateId?: string;
  templateMembers?: TemplateMemberConfig[];
}

interface WizardState {
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  skippedSteps: WizardStep[];
  data: WizardData;

  // Installation state
  isInstalling: boolean;
  installProgress: number;
  installCurrentTask: string;
  installLog: string[];
  installError: string | null;

  // Navigation
  setStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipStep: () => void;
  canGoNext: () => boolean;
  canGoPrev: () => boolean;
  canSkip: () => boolean;
  getStepIndex: () => number;
  getTotalSteps: () => number;

  // Data management
  updateData: (data: Partial<WizardData>) => void;
  updateInstance: (instance: Partial<InstanceConfig>) => void;
  updateModels: (models: Partial<ModelConfig>) => void;
  markStepComplete: (step: WizardStep) => void;
  isStepComplete: (step: WizardStep) => boolean;
  reset: () => void;

  // Installation
  startInstall: () => void;
  setInstallProgress: (progress: number, task?: string) => void;
  addInstallLog: (log: string) => void;
  setInstallError: (error: string | null) => void;
  completeInstall: () => void;
}

export const STEP_ORDER: WizardStep[] = [
  'welcome',
  'prerequisites',
  'instance',
  'network',
  'auth',
  'providers',
  'review',
  'install',
  'models',
  'complete',
];

// Steps that can be skipped
// Steps that can be skipped
const SKIPPABLE_STEPS: WizardStep[] = ['models', 'providers'];

// Step metadata for UI
export const STEP_META: Record<
  WizardStep,
  { title: string; description: string; icon: string }
> = {
  welcome: {
    title: 'Welcome',
    description: 'Get started with Clawpit',
    icon: '👋',
  },
  prerequisites: {
    title: 'Prerequisites',
    description: 'Check system requirements',
    icon: '✓',
  },
  instance: {
    title: 'Instance',
    description: 'Create OpenClaw instance',
    icon: '🔧',
  },
  network: {
    title: 'Network',
    description: 'Configure ports and binding',
    icon: '🌐',
  },
  auth: {
    title: 'Authentication',
    description: 'Set up security token',
    icon: '🔐',
  },
  models: {
    title: 'AI Models',
    description: 'Configure AI model providers',
    icon: '🤖',
  },
  providers: {
    title: 'Providers',
    description: 'Configure messaging providers',
    icon: '💬',
  },
  review: {
    title: 'Review',
    description: 'Confirm your settings',
    icon: '📋',
  },
  install: {
    title: 'Install',
    description: 'Setting up OpenClaw',
    icon: '⚙️',
  },
  complete: {
    title: 'Complete',
    description: 'Setup finished',
    icon: '🎉',
  },
};

const createDefaultInstance = (): InstanceConfig => ({
  id: 'default',
  name: 'Default',
  description: 'Default OpenClaw instance',
  gatewayPort: 18789,
  bridgePort: 18790,
  bindMode: 'lan',
  authToken: '',
  tokenGenerated: false,
  providers: {
    whatsapp: false,
    telegram: { enabled: false, token: '' },
    discord: { enabled: false, token: '' },
  },
});

const createDefaultModels = (): ModelConfig => ({
  openai: { enabled: false, authenticated: false },
  anthropic: { enabled: false, authenticated: false },
});

const initialData: WizardData = {
  // clawpitDir will be set from backend on init - empty string means not yet initialized
  clawpitDir: '',
  instance: createDefaultInstance(),
  models: createDefaultModels(),
  wslDistro: 'Ubuntu',
  isFirstRun: true,
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      currentStep: 'welcome',
      completedSteps: [],
      skippedSteps: [],
      data: initialData,
      isInstalling: false,
      installProgress: 0,
      installCurrentTask: '',
      installLog: [],
      installError: null,

      setStep: (step) => {
        set({ currentStep: step });
      },

      nextStep: () => {
        const state = get();
        const currentIndex = STEP_ORDER.indexOf(state.currentStep);
        if (currentIndex < STEP_ORDER.length - 1) {
          const nextStep = STEP_ORDER[currentIndex + 1];
          const newCompleted = state.completedSteps.includes(state.currentStep)
            ? state.completedSteps
            : [...state.completedSteps, state.currentStep];
          set({
            currentStep: nextStep,
            completedSteps: newCompleted,
          });
        }
      },

      prevStep: () => {
        const currentIndex = STEP_ORDER.indexOf(get().currentStep);
        if (currentIndex > 0) {
          set({ currentStep: STEP_ORDER[currentIndex - 1] });
        }
      },

      skipStep: () => {
        const state = get();
        const currentIndex = STEP_ORDER.indexOf(state.currentStep);
        if (
          currentIndex < STEP_ORDER.length - 1 &&
          SKIPPABLE_STEPS.includes(state.currentStep)
        ) {
          const nextStep = STEP_ORDER[currentIndex + 1];
          set({
            currentStep: nextStep,
            skippedSteps: [...state.skippedSteps, state.currentStep],
          });
        }
      },

      canGoNext: () => {
        const state = get();
        const currentIndex = STEP_ORDER.indexOf(state.currentStep);
        // Can't go next on the last step
        if (currentIndex >= STEP_ORDER.length - 1) return false;
        // During installation, can only go next when complete
        if (state.currentStep === 'install') {
          return state.installProgress === 100 && !state.installError;
        }
        return true;
      },

      canGoPrev: () => {
        const state = get();
        const currentIndex = STEP_ORDER.indexOf(state.currentStep);
        // Can't go back from welcome or during installation
        if (currentIndex === 0) return false;
        if (state.currentStep === 'install' && state.isInstalling) return false;
        if (state.currentStep === 'complete') return false;
        return true;
      },

      canSkip: () => {
        const state = get();
        return SKIPPABLE_STEPS.includes(state.currentStep);
      },

      getStepIndex: () => {
        return STEP_ORDER.indexOf(get().currentStep);
      },

      getTotalSteps: () => {
        return STEP_ORDER.length;
      },

      updateData: (data) => {
        set({ data: { ...get().data, ...data } });
      },

      updateInstance: (instance) => {
        const state = get();
        set({
          data: {
            ...state.data,
            instance: { ...state.data.instance, ...instance },
          },
        });
      },

      updateModels: (models) => {
        const state = get();
        set({
          data: {
            ...state.data,
            models: { ...state.data.models, ...models },
          },
        });
      },

      markStepComplete: (step) => {
        const state = get();
        if (!state.completedSteps.includes(step)) {
          set({ completedSteps: [...state.completedSteps, step] });
        }
      },

      isStepComplete: (step) => {
        return get().completedSteps.includes(step);
      },

      reset: () => {
        set({
          currentStep: 'welcome',
          completedSteps: [],
          skippedSteps: [],
          data: {
            ...initialData,
            instance: createDefaultInstance(),
            models: createDefaultModels(),
          },
          isInstalling: false,
          installProgress: 0,
          installCurrentTask: '',
          installLog: [],
          installError: null,
        });
      },

      startInstall: () => {
        set({
          isInstalling: true,
          installProgress: 0,
          installCurrentTask: 'Initializing...',
          installLog: [],
          installError: null,
        });
      },

      setInstallProgress: (progress, task) => {
        set({
          installProgress: progress,
          ...(task ? { installCurrentTask: task } : {}),
        });
      },

      addInstallLog: (log) => {
        set({ installLog: [...get().installLog, log] });
      },

      setInstallError: (error) => {
        set({ installError: error, isInstalling: false });
      },

      completeInstall: () => {
        const state = get();
        set({
          isInstalling: false,
          installProgress: 100,
          installCurrentTask: 'Complete!',
          currentStep: 'models', // Go to models step after install
          completedSteps: [...state.completedSteps, 'install'],
        });
      },
    }),
    {
      name: 'clawpit-wizard',
      partialize: (state) => ({
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        skippedSteps: state.skippedSteps,
        data: state.data,
      }),
    },
  ),
);
