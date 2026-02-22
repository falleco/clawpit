import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  FastForward,
  FileText,
  PanelRight,
  PanelRightDashed,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Square,
} from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  DockerSetupWizard,
  FeatureTour,
  InstanceTerminal,
  TemplateDetail,
  WizardContainer,
  WSL2SetupWizard,
} from '@/components';
import { DashboardLayout } from '@/components/dashboard';
import {
  HEALTH_SETTINGS_WINDOW_LABEL,
  HealthMonitor,
  type HealthMonitorHandle,
  HealthSettingsWindow,
} from '@/components/health';
import { SETTINGS_WINDOW_LABEL, SettingsPage } from '@/components/settings';
import { type SidebarView } from '@/components/sidebar';
import {
  Button,
  Skeleton,
  Spinner,
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { MainWindowLayout } from '@/layouts/main-window-layout';
import {
  hasSeenFeatureTour,
  markFeatureTourSeen,
} from '@/lib/onboarding-store';
import { loadRuntimeCapabilities } from '@/lib/runtime-capabilities';
import { ThemeProvider } from '@/lib/theme';
import { cn } from '@/lib/utils';
import {
  HomeScreen,
  InstallationGuideScreen,
  PrerequisitesScreen,
  SecurityScreen,
  TemplatesScreen,
} from '@/screens';
import {
  getMainViewFromPath,
  MAIN_VIEW_ROUTES,
  type MainView,
} from '@/screens/routes';
import {
  type ClawpitInstance,
  useConfigStore,
  useInstanceStore,
  useWizardStore,
} from '@/stores';

// Clawpit state from backend
interface ClawpitState {
  clawpitDir: string;
  exists: boolean;
  hasConfig: boolean;
  instances: string[];
  hasRunningInstance: boolean;
  runningInstanceName: string | null;
  action: 'new_setup' | 'resume_setup' | 'dashboard';
}

interface HealthAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  resolved: boolean;
}

interface HealthInstanceMetric {
  containerState:
    | 'running'
    | 'stopped'
    | 'starting'
    | 'stopping'
    | 'restarting'
    | 'unknown';
}

interface HealthSummary {
  overallStatus: 'healthy' | 'degraded' | 'critical' | 'unknown';
  healthyInstances: number;
  degradedInstances: number;
  criticalInstances: number;
  totalInstances: number;
  instances: HealthInstanceMetric[];
  alerts: HealthAlert[];
}

type TrayStatusPayload =
  | 'running'
  | 'transitioning'
  | 'error'
  | 'not_configured';

function getTrayStatusFromHealth(summary: HealthSummary): {
  status: TrayStatusPayload;
  details: string;
} {
  const hasTransitions = summary.instances.some((instance) =>
    ['starting', 'stopping', 'restarting'].includes(instance.containerState),
  );

  if (summary.totalInstances === 0) {
    return {
      status: 'not_configured',
      details: 'No instances configured',
    };
  }

  if (summary.overallStatus === 'critical' || summary.criticalInstances > 0) {
    return {
      status: 'error',
      details: `${summary.criticalInstances} critical instance(s)`,
    };
  }

  if (
    hasTransitions ||
    summary.overallStatus === 'degraded' ||
    summary.degradedInstances > 0
  ) {
    return {
      status: 'transitioning',
      details: `${summary.healthyInstances}/${summary.totalInstances} healthy`,
    };
  }

  if (summary.overallStatus === 'healthy') {
    return {
      status: 'running',
      details: `${summary.healthyInstances}/${summary.totalInstances} healthy`,
    };
  }

  return {
    status: 'not_configured',
    details: 'Awaiting health data',
  };
}

// Settings window component
function SettingsWindowContent() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background px-6 py-5 text-foreground">
        <div className="mx-auto w-full max-w-6xl">
          <SettingsPage />
        </div>
      </div>
    </ThemeProvider>
  );
}

// Health settings window component
function HealthSettingsWindowContent() {
  return (
    <ThemeProvider>
      <HealthSettingsWindow />
    </ThemeProvider>
  );
}

// Main app window component
function MainAppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentView = useMemo<MainView>(
    () => getMainViewFromPath(location.pathname),
    [location.pathname],
  );

  const { config, platform, loadConfig, detectPlatform } = useConfigStore();
  const { reset: resetWizard, updateData, setStep } = useWizardStore();
  const {
    instances,
    setClawpitDir: setInstanceStoreClawpitDir,
    loadInstances: loadDashboardInstances,
    refreshInstanceStatus: refreshDashboardInstanceStatus,
    startAllInstances,
    startInstance,
    stopInstance,
    restartInstance,
  } = useInstanceStore();

  const [prerequisitesPassed, setPrerequisitesPassed] = useState(false);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [clawpitDir, setClawpitDir] = useState<string | null>(null);
  const [isCheckingState, setIsCheckingState] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [isTemplatePanelOpen, setIsTemplatePanelOpen] = useState(false);
  const [featureTourOpen, setFeatureTourOpen] = useState(false);
  const [isRefreshingDashboard, setIsRefreshingDashboard] = useState(false);
  const [isStartingAll, setIsStartingAll] = useState(false);
  const [isHealthToolbarBusy, setIsHealthToolbarBusy] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [terminalInstance, setTerminalInstance] =
    useState<ClawpitInstance | null>(null);
  const [liquidGlassEnabled] = useState(
    () => loadRuntimeCapabilities()?.liquidGlassEnabled ?? false,
  );
  const activeClawpitDir = clawpitDir ?? config?.openclawDir ?? null;
  const initializedRef = useRef(false);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const monitorInitializedRef = useRef(false);
  const healthMonitorRef = useRef<HealthMonitorHandle | null>(null);

  const navigateToView = useCallback(
    (view: MainView, options?: { replace?: boolean }) => {
      navigate(MAIN_VIEW_ROUTES[view], { replace: options?.replace ?? false });
    },
    [navigate],
  );

  const openSettingsWindow = useCallback(async () => {
    try {
      await invoke('open_settings_window');
    } catch (error) {
      console.error('Failed to open settings window:', error);
    }
  }, []);

  // Check clawpit state on startup and navigate accordingly
  const checkClawpitState = useCallback(async () => {
    try {
      const state = await invoke<ClawpitState>('check_clawpit_state');
      setClawpitDir(state.clawpitDir);

      switch (state.action) {
        case 'dashboard':
          setSetupCompleted(true);
          setPrerequisitesPassed(true);
          updateData({ clawpitDir: state.clawpitDir });
          navigateToView('dashboard', { replace: true });
          break;
        case 'resume_setup':
          setPrerequisitesPassed(true);
          updateData({ clawpitDir: state.clawpitDir });
          setStep('instance');
          navigateToView('setup-wizard', { replace: true });
          break;
        default:
          resetWizard();
          updateData({ clawpitDir: state.clawpitDir });
          navigateToView('home', { replace: true });
          break;
      }
    } catch (error) {
      console.error('Failed to check clawpit state:', error);
      resetWizard();
      try {
        const paths = await invoke<{ clawpitDir: string }>(
          'get_default_clawpit_paths',
        );
        updateData({ clawpitDir: paths.clawpitDir });
        setClawpitDir(paths.clawpitDir);
      } catch {
        console.error('Failed to get default clawpit paths');
      }
      navigateToView('home', { replace: true });
    } finally {
      setIsCheckingState(false);
    }
  }, [updateData, setStep, resetWizard, navigateToView]);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    // Initialize on mount
    detectPlatform();
    loadConfig();
    checkClawpitState();
  }, [detectPlatform, loadConfig, checkClawpitState]);

  // Check if setup is already completed (has a configured clawpit dir)
  useEffect(() => {
    if (config?.openclawDir) {
      setSetupCompleted(true);
      setClawpitDir(config.openclawDir);
    }
  }, [config]);

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      switch (event.key) {
        case '1':
          event.preventDefault();
          navigateToView('home');
          break;
        case '2':
          if (setupCompleted) {
            event.preventDefault();
            navigateToView('dashboard');
          }
          break;
        case '3':
          if (setupCompleted) {
            event.preventDefault();
            navigateToView('health');
          }
          break;
        case '4':
          if (setupCompleted) {
            event.preventDefault();
            navigateToView('templates');
          }
          break;
        case '5':
          event.preventDefault();
          void openSettingsWindow();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [setupCompleted, openSettingsWindow, navigateToView]);

  useEffect(() => {
    seenAlertIdsRef.current.clear();
    monitorInitializedRef.current = false;
  }, []);

  useEffect(() => {
    if (isCheckingState) {
      return;
    }

    let cancelled = false;
    const checkTour = async () => {
      const seen = await hasSeenFeatureTour();
      if (!seen && !cancelled) {
        setFeatureTourOpen(true);
      }
    };

    void checkTour();

    return () => {
      cancelled = true;
    };
  }, [isCheckingState]);

  useEffect(() => {
    let unlistenTrayError: UnlistenFn | null = null;

    const register = async () => {
      unlistenTrayError = await listen<string>(
        'tray-action-error',
        async (event) => {
          console.error('Tray action failed:', event.payload);
          if (config?.preferences?.notificationsEnabled) {
            try {
              await invoke('send_health_notification', {
                title: 'Tray action failed',
                body: event.payload,
              });
            } catch (error) {
              console.error('Failed to send tray error notification:', error);
            }
          }
        },
      );
    };

    void register();

    return () => {
      if (unlistenTrayError) {
        void unlistenTrayError();
      }
    };
  }, [config?.preferences?.notificationsEnabled]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let intervalId: number | null = null;

    const runHealthMonitor = async () => {
      if (disposed || inFlight) {
        return;
      }

      if (!setupCompleted || !activeClawpitDir) {
        try {
          await invoke('set_tray_status', {
            status: 'not_configured',
            details: 'Setup not completed',
          });
        } catch {
          // Ignore tray update errors.
        }
        return;
      }

      inFlight = true;

      try {
        const summary = await invoke<HealthSummary>('get_health_summary', {
          clawpitDir: activeClawpitDir,
          wslDistro: config?.wslDistro ?? null,
        });

        const trayState = getTrayStatusFromHealth(summary);
        await invoke('set_tray_status', {
          status: trayState.status,
          details: trayState.details,
        });

        const unseenAlerts = summary.alerts.filter(
          (alert) => !alert.resolved && !seenAlertIdsRef.current.has(alert.id),
        );

        if (!monitorInitializedRef.current) {
          unseenAlerts.forEach((alert) => {
            seenAlertIdsRef.current.add(alert.id);
          });
          monitorInitializedRef.current = true;
          return;
        }

        for (const alert of unseenAlerts) {
          seenAlertIdsRef.current.add(alert.id);

          if (config?.preferences?.notificationsEnabled) {
            await invoke('send_health_notification', {
              title: alert.title,
              body: alert.message,
            });
          }

          if (alert.severity === 'critical') {
            const isVisible = await invoke<boolean>(
              'is_main_window_visible',
            ).catch(() => true);
            if (!isVisible) {
              await invoke('show_main_window');
            }
          }
        }
      } catch (error) {
        console.error('Background health monitor failed:', error);
        await invoke('set_tray_status', {
          status: 'error',
          details: 'Health monitor failed',
        }).catch(() => {});
      } finally {
        inFlight = false;
      }
    };

    void runHealthMonitor();
    intervalId = window.setInterval(() => {
      void runHealthMonitor();
    }, 30000);

    return () => {
      disposed = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [
    activeClawpitDir,
    setupCompleted,
    config?.wslDistro,
    config?.preferences?.notificationsEnabled,
  ]);

  const handlePrerequisitesPassed = () => {
    setPrerequisitesPassed(true);
  };

  const handleWslWizardComplete = (_distro: string) => {
    navigateToView('prerequisites');
  };

  const handleDockerWizardComplete = () => {
    navigateToView('prerequisites');
  };

  const handleInstallationGuideComplete = () => {
    navigateToView('prerequisites');
  };

  const handleStartSetupWizard = useCallback(async () => {
    resetWizard();
    // Make sure to set the correct clawpit dir from backend
    try {
      const state = await invoke<ClawpitState>('check_clawpit_state');
      updateData({ clawpitDir: state.clawpitDir });
    } catch (error) {
      console.error('Failed to get clawpit paths:', error);
    }
    navigateToView('setup-wizard');
  }, [resetWizard, updateData, navigateToView]);

  const handleWizardComplete = async () => {
    setSetupCompleted(true);
    // Refresh clawpit state to get the correct directory
    try {
      const state = await invoke<ClawpitState>('check_clawpit_state');
      setClawpitDir(state.clawpitDir);
    } catch {
      // Fallback to wizard data
      const wizardData = useWizardStore.getState().data;
      setClawpitDir(wizardData.clawpitDir);
    }
    navigateToView('dashboard');
  };

  const handleWizardCancel = () => {
    navigateToView('home');
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIsTemplatePanelOpen(true);
  };

  const handleOpenTerminal = useCallback(
    (instance: ClawpitInstance) => {
      setTerminalInstance(instance);
      navigateToView('terminal');
    },
    [navigateToView],
  );

  const handleStartInstanceFromTemplate = () => {
    setIsTemplatePanelOpen(false);
    navigateToView('setup-wizard');
  };

  useEffect(() => {
    if (activeClawpitDir) {
      setInstanceStoreClawpitDir(activeClawpitDir);
    }
  }, [activeClawpitDir, setInstanceStoreClawpitDir]);

  useEffect(() => {
    if (!setupCompleted || !activeClawpitDir) {
      return;
    }

    let disposed = false;

    const loadForOverview = async () => {
      try {
        await loadDashboardInstances();
        const latestInstances = useInstanceStore.getState().instances;
        for (const instance of latestInstances) {
          if (disposed) {
            return;
          }
          await refreshDashboardInstanceStatus(instance.id);
        }
      } catch (error) {
        console.error('Failed to load dashboard overview state:', error);
      }
    };

    void loadForOverview();

    return () => {
      disposed = true;
    };
  }, [
    setupCompleted,
    activeClawpitDir,
    loadDashboardInstances,
    refreshDashboardInstanceStatus,
  ]);

  const handleDashboardRefresh = useCallback(async () => {
    setIsRefreshingDashboard(true);
    try {
      await loadDashboardInstances();
      const latestInstances = useInstanceStore.getState().instances;
      for (const instance of latestInstances) {
        await refreshDashboardInstanceStatus(instance.id);
      }
    } catch (error) {
      console.error('Failed to refresh dashboard instances:', error);
    } finally {
      setIsRefreshingDashboard(false);
    }
  }, [loadDashboardInstances, refreshDashboardInstanceStatus]);

  const handleDashboardStartAll = useCallback(async () => {
    setIsStartingAll(true);
    try {
      await startAllInstances();
    } catch (error) {
      console.error('Failed to start all instances:', error);
    } finally {
      setIsStartingAll(false);
    }
  }, [startAllInstances]);

  // Get the selected instance from the store
  const selectedInstance = useMemo(
    () => instances.find((i) => i.id === selectedInstanceId) ?? null,
    [instances, selectedInstanceId],
  );

  const handleInstanceSelect = useCallback(
    (instance: ClawpitInstance | null) => {
      setSelectedInstanceId(instance?.id ?? null);
    },
    [],
  );

  // Clear selected instance when leaving dashboard view
  useEffect(() => {
    if (currentView !== 'dashboard') {
      setSelectedInstanceId(null);
    }
  }, [currentView]);

  const navbarTitleByView: Record<MainView, string> = {
    home: 'Home',
    prerequisites: 'Prerequisites',
    'wsl-wizard': 'WSL2 Setup',
    'docker-wizard': 'Docker Setup',
    'installation-guide': 'Installation Guide',
    'setup-wizard': 'Setup Wizard',
    dashboard: 'Instances',
    health: 'Health',
    templates: 'Templates',
    security: 'Security',
    terminal: 'Terminal',
  };

  // Status colors and labels for instances
  const statusColors: Record<ClawpitInstance['status'], string> = {
    running: 'bg-green-500',
    stopped: 'bg-gray-500',
    starting: 'bg-yellow-500',
    stopping: 'bg-yellow-500',
    error: 'bg-red-500',
    unknown: 'bg-gray-400',
  };

  const dashboardStartableCount = instances.filter(
    (instance) =>
      instance.status === 'stopped' ||
      instance.status === 'error' ||
      instance.status === 'unknown',
  ).length;

  // Instance detail toolbar (when an instance is selected)
  const instanceDetailToolbar = useMemo<ReactNode>(() => {
    if (!selectedInstance) return null;

    const isRunning = selectedInstance.status === 'running';
    const isStopped = selectedInstance.status === 'stopped';
    const isTransitioning =
      selectedInstance.status === 'starting' ||
      selectedInstance.status === 'stopping';

    return (
      <TooltipProvider delayDuration={250}>
        <div className="flex items-center gap-1">
          {(isStopped ||
            selectedInstance.status === 'error' ||
            selectedInstance.status === 'unknown') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Start Instance"
                  onClick={() => startInstance(selectedInstance.id)}
                  className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10"
                >
                  <Play className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                <TooltipArrow />
                Start
              </TooltipContent>
            </Tooltip>
          )}

          {isRunning && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Stop Instance"
                  onClick={() => stopInstance(selectedInstance.id)}
                  className="h-10 w-10 rounded-xl border-0 bg-transparent text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                >
                  <Square className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                <TooltipArrow />
                Stop
              </TooltipContent>
            </Tooltip>
          )}

          {isRunning && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Restart Instance"
                  onClick={() => restartInstance(selectedInstance.id)}
                  className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                <TooltipArrow />
                Restart
              </TooltipContent>
            </Tooltip>
          )}

          {isTransitioning && (
            <Button
              variant="ghost"
              size="icon"
              disabled
              className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none opacity-45"
            >
              <RefreshCw className="h-4 w-4 animate-spin" />
            </Button>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="View Logs"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('open-instance-logs', {
                      detail: { instanceId: selectedInstance.id },
                    }),
                  );
                }}
                className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10"
              >
                <FileText className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <TooltipArrow />
              View Logs
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit Configuration"
                onClick={() => void openSettingsWindow()}
                className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <TooltipArrow />
              Edit Configuration
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }, [
    selectedInstance,
    startInstance,
    stopInstance,
    restartInstance,
    openSettingsWindow,
  ]);

  // Instance list toolbar (when no instance is selected)
  const instanceListToolbar = useMemo<ReactNode>(() => {
    return (
      <TooltipProvider delayDuration={250}>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="New Instance"
                onClick={handleStartSetupWizard}
                className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <TooltipArrow />
              New Instance
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh Instances"
                onClick={() => void handleDashboardRefresh()}
                disabled={isRefreshingDashboard || isStartingAll}
                className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground disabled:opacity-45 dark:hover:bg-white/10"
              >
                <RefreshCw
                  className={cn(
                    'h-4 w-4',
                    isRefreshingDashboard && 'animate-spin',
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <TooltipArrow />
              Refresh
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Start All Instances"
                onClick={() => void handleDashboardStartAll()}
                disabled={
                  isStartingAll ||
                  isRefreshingDashboard ||
                  dashboardStartableCount === 0
                }
                className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground disabled:opacity-45 dark:hover:bg-white/10"
              >
                <FastForward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <TooltipArrow />
              {isStartingAll ? 'Starting...' : 'Start All'}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }, [
    isRefreshingDashboard,
    isStartingAll,
    dashboardStartableCount,
    handleDashboardRefresh,
    handleDashboardStartAll,
    handleStartSetupWizard,
  ]);

  const dashboardToolbar = useMemo<ReactNode>(() => {
    if (currentView !== 'dashboard') {
      return null;
    }

    return selectedInstance ? instanceDetailToolbar : instanceListToolbar;
  }, [
    currentView,
    selectedInstance,
    instanceDetailToolbar,
    instanceListToolbar,
  ]);

  const healthToolbar = useMemo<ReactNode>(() => {
    if (currentView !== 'health' || !activeClawpitDir) {
      return null;
    }

    return (
      <TooltipProvider delayDuration={250}>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh"
                onClick={() => healthMonitorRef.current?.refresh()}
                disabled={isHealthToolbarBusy}
                className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground disabled:opacity-45 dark:hover:bg-white/10"
              >
                <RefreshCw
                  className={cn(
                    'h-4 w-4',
                    isHealthToolbarBusy && 'animate-spin',
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <TooltipArrow />
              Refresh
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Settings"
                onClick={() => healthMonitorRef.current?.openSettings()}
                disabled={isHealthToolbarBusy}
                className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground disabled:opacity-45 dark:hover:bg-white/10"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <TooltipArrow />
              Settings
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }, [currentView, activeClawpitDir, isHealthToolbarBusy]);

  const templatesToolbar = useMemo<ReactNode>(() => {
    if (currentView !== 'templates' || !activeClawpitDir) {
      return null;
    }

    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsTemplatePanelOpen((open) => !open)}
              className="h-10 w-10 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10"
            >
              {isTemplatePanelOpen ? (
                <PanelRightDashed className="h-4 w-4" />
              ) : (
                <PanelRight className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            <TooltipArrow />
            {isTemplatePanelOpen ? 'Hide Details' : 'Show Details'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }, [currentView, activeClawpitDir, isTemplatePanelOpen]);

  const navbarToolbar =
    currentView === 'dashboard'
      ? dashboardToolbar
      : currentView === 'health'
        ? healthToolbar
        : templatesToolbar;

  useEffect(() => {
    if (currentView !== 'templates') {
      setIsTemplatePanelOpen(false);
    }
  }, [currentView]);

  const handleSidebarNavigate = useCallback(
    (view: SidebarView) => {
      navigateToView(view);
    },
    [navigateToView],
  );

  // Show loading state while checking clawpit state
  if (isCheckingState) {
    return (
      <ThemeProvider>
        <div className="min-h-screen bg-background text-foreground flex flex-col">
          <div className="h-12 titlebar-drag-region" />
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="w-full max-w-3xl space-y-4">
              <div className="text-center space-y-2">
                <Spinner size="lg" />
                <p className="text-muted-foreground">Loading Clawpit...</p>
              </div>
              <Skeleton className="h-28 w-full" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  const liquidGlassSupported = liquidGlassEnabled;
  const showBackButton =
    (currentView === 'dashboard' && selectedInstance !== null) ||
    currentView === 'terminal';
  const navbarTitle =
    currentView === 'terminal' && terminalInstance
      ? `${terminalInstance.name} ttyd`
      : currentView === 'dashboard' && selectedInstance
        ? selectedInstance.name
        : navbarTitleByView[currentView];
  const statusIndicatorClassName =
    currentView === 'dashboard' && selectedInstance
      ? statusColors[selectedInstance.status]
      : undefined;
  const statusIndicatorTitle =
    currentView === 'dashboard' && selectedInstance
      ? selectedInstance.status
      : undefined;

  const rightPanel =
    currentView === 'templates' && activeClawpitDir ? (
      <aside
        className={cn(
          'h-screen shrink-0 overflow-hidden border-l shadow-2xl transition-[width,opacity] duration-300 ease-out',
          'backdrop-blur-2xl bg-white/55 border-white/40 dark:bg-slate-900/55 dark:border-white/10',
          isTemplatePanelOpen
            ? 'opacity-100'
            : 'pointer-events-none border-transparent opacity-0',
        )}
        style={{
          width: isTemplatePanelOpen ? 'clamp(320px, 34vw, 520px)' : '0px',
        }}
      >
        <div
          className={cn(
            'h-full overflow-y-auto transition-opacity duration-200',
            isTemplatePanelOpen ? 'opacity-100' : 'opacity-0',
          )}
        >
          <TemplateDetail
            templateId={selectedTemplateId}
            clawpitDir={activeClawpitDir}
            onClose={() => setIsTemplatePanelOpen(false)}
            onStartInstance={handleStartInstanceFromTemplate}
          />
        </div>
      </aside>
    ) : null;

  return (
    <ThemeProvider>
      <Routes>
        <Route
          element={
            <MainWindowLayout
              currentView={currentView}
              title={navbarTitle}
              showBackButton={showBackButton}
              onBack={() => {
                if (currentView === 'terminal') {
                  setTerminalInstance(null);
                  navigateToView('dashboard');
                  return;
                }

                handleInstanceSelect(null);
              }}
              showDashboard={setupCompleted}
              onNavigate={handleSidebarNavigate}
              toolbar={navbarToolbar}
              statusIndicatorClassName={statusIndicatorClassName}
              statusIndicatorTitle={statusIndicatorTitle}
              rightPanel={rightPanel}
              liquidGlassSupported={liquidGlassSupported}
            />
          }
        >
          <Route
            path={MAIN_VIEW_ROUTES.home}
            element={
              <HomeScreen
                clawpitDir={activeClawpitDir}
                instances={instances}
                prerequisitesPassed={prerequisitesPassed}
                setupCompleted={setupCompleted}
                onOpenPrerequisites={() => navigateToView('prerequisites')}
                onStartSetupWizard={handleStartSetupWizard}
                onOpenDashboard={() => navigateToView('dashboard')}
              />
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES.prerequisites}
            element={
              <PrerequisitesScreen
                platform={platform}
                prerequisitesPassed={prerequisitesPassed}
                onBack={() => navigateToView('home')}
                onAllPassed={handlePrerequisitesPassed}
                onOpenWslWizard={() => navigateToView('wsl-wizard')}
                onOpenDockerWizard={() => navigateToView('docker-wizard')}
                onOpenInstallationGuide={() =>
                  navigateToView('installation-guide')
                }
                onContinueToSetup={handleStartSetupWizard}
              />
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES['wsl-wizard']}
            element={
              <div className="mx-auto space-y-6">
                <WSL2SetupWizard
                  onComplete={handleWslWizardComplete}
                  onCancel={() => navigateToView('prerequisites')}
                />
              </div>
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES['docker-wizard']}
            element={
              platform ? (
                <div className="mx-auto space-y-6">
                  <DockerSetupWizard
                    platform={platform}
                    onComplete={handleDockerWizardComplete}
                    onCancel={() => navigateToView('prerequisites')}
                  />
                </div>
              ) : (
                <Navigate to={MAIN_VIEW_ROUTES.prerequisites} replace />
              )
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES['installation-guide']}
            element={
              <InstallationGuideScreen
                onBack={() => navigateToView('prerequisites')}
                onComplete={handleInstallationGuideComplete}
                onCancel={() => navigateToView('prerequisites')}
              />
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES['setup-wizard']}
            element={
              <div className="mx-auto max-w-3xl">
                <WizardContainer
                  onComplete={handleWizardComplete}
                  onCancel={handleWizardCancel}
                />
              </div>
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES.dashboard}
            element={
              activeClawpitDir ? (
                <div className="mx-auto h-full">
                  <DashboardLayout
                    clawpitDir={activeClawpitDir}
                    onNavigateSettings={() => {
                      void openSettingsWindow();
                    }}
                    selectedInstance={selectedInstance}
                    onInstanceSelect={handleInstanceSelect}
                    onOpenTerminal={handleOpenTerminal}
                  />
                </div>
              ) : (
                <Navigate to={MAIN_VIEW_ROUTES.home} replace />
              )
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES.health}
            element={
              activeClawpitDir ? (
                <div className="mx-auto h-full">
                  <HealthMonitor
                    ref={healthMonitorRef}
                    clawpitDir={activeClawpitDir}
                    showHeader={false}
                    onLoadingChange={setIsHealthToolbarBusy}
                  />
                </div>
              ) : (
                <Navigate to={MAIN_VIEW_ROUTES.home} replace />
              )
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES.templates}
            element={
              <TemplatesScreen
                clawpitDir={activeClawpitDir}
                onSelectTemplate={handleSelectTemplate}
              />
            }
          />
          <Route
            path={MAIN_VIEW_ROUTES.security}
            element={<SecurityScreen clawpitDir={activeClawpitDir} />}
          />
          <Route
            path={MAIN_VIEW_ROUTES.terminal}
            element={
              activeClawpitDir && terminalInstance ? (
                <div className="h-full w-full">
                  <InstanceTerminal
                    instanceId={terminalInstance.id}
                    instanceName={terminalInstance.name}
                    clawpitDir={activeClawpitDir}
                  />
                </div>
              ) : (
                <Navigate to={MAIN_VIEW_ROUTES.dashboard} replace />
              )
            }
          />
          <Route
            path="*"
            element={<Navigate to={MAIN_VIEW_ROUTES.home} replace />}
          />
        </Route>
      </Routes>

      <div>
        <FeatureTour
          open={featureTourOpen}
          onSkip={() => {
            setFeatureTourOpen(false);
            void markFeatureTourSeen();
          }}
          onComplete={() => {
            setFeatureTourOpen(false);
            void markFeatureTourSeen();
          }}
        />
      </div>
    </ThemeProvider>
  );
}

// Router component that determines which window content to render
function App() {
  const windowLabel = getCurrentWindow().label;

  if (windowLabel === SETTINGS_WINDOW_LABEL) {
    return <SettingsWindowContent />;
  }

  if (windowLabel === HEALTH_SETTINGS_WINDOW_LABEL) {
    return <HealthSettingsWindowContent />;
  }

  return <MainAppContent />;
}

export default App;
