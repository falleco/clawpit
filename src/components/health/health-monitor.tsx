import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Cpu,
  HardDrive,
  Heart,
  HeartPulse,
  MemoryStick,
  Play,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { HEALTH_SETTINGS_WINDOW_LABEL } from './constants';
import { HealthAlertList } from './health-alert-list';

// Types matching Rust structs
interface HealthMetrics {
  instanceId: string;
  instanceName: string;
  cpuPercent: number | null;
  memoryUsedMb: number | null;
  memoryLimitMb: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  gatewayReachable: boolean;
  containerHealth: string | null;
  containerState: string;
  runningContainers: number;
  totalContainers: number;
  timestamp: string;
  error: string | null;
}

interface AlertCounts {
  info: number;
  warning: number;
  critical: number;
}

interface HealthAlert {
  id: string;
  instanceId: string | null;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  currentValue: string | null;
  thresholdValue: string | null;
  createdAt: string;
  acknowledged: boolean;
  resolved: boolean;
  resolvedAt: string | null;
}

interface HealthSummary {
  overallStatus: string;
  healthyInstances: number;
  degradedInstances: number;
  criticalInstances: number;
  totalInstances: number;
  activeAlerts: AlertCounts;
  instances: HealthMetrics[];
  alerts: HealthAlert[];
  timestamp: string;
}

interface HealthMonitoringConfig {
  enabled: boolean;
  checkIntervalSecs: number;
  cpuThresholdPercent: number;
  memoryThresholdPercent: number;
  diskThresholdPercent: number;
  autoRecoveryEnabled: boolean;
  maxRecoveryAttempts: number;
  recoveryCooldownSecs: number;
  notificationsEnabled: boolean;
}

interface HealthMonitorProps {
  clawpitDir: string;
  wslDistro?: string;
  showHeader?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}

export interface HealthMonitorHandle {
  refresh: () => void;
  openSettings: () => void;
}

export const HealthMonitor = forwardRef<
  HealthMonitorHandle,
  HealthMonitorProps
>(function HealthMonitor(
  {
    clawpitDir,
    wslDistro,
    showHeader = true,
    onLoadingChange,
  }: HealthMonitorProps,
  ref,
) {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [config, setConfig] = useState<HealthMonitoringConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState<string | null>(null);

  // Fetch health summary
  const fetchHealthSummary = useCallback(
    async (blocking = false) => {
      if (blocking) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      try {
        const result = await invoke<HealthSummary>('get_health_summary', {
          clawpitDir,
          wslDistro,
        });
        setSummary(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (blocking) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [clawpitDir, wslDistro],
  );

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      const result = await invoke<HealthMonitoringConfig>(
        'get_health_monitoring_config',
      );
      setConfig(result);
    } catch (err) {
      console.error('Failed to fetch health config:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchHealthSummary(true);
    fetchConfig();
  }, [fetchHealthSummary, fetchConfig]);

  // Auto-refresh
  useEffect(() => {
    if (!config?.enabled) return;

    const interval = setInterval(
      () => {
        void fetchHealthSummary(false);
      },
      (config?.checkIntervalSecs || 30) * 1000,
    );
    return () => clearInterval(interval);
  }, [fetchHealthSummary, config?.enabled, config?.checkIntervalSecs]);

  useEffect(() => {
    onLoadingChange?.(isLoading || isRefreshing);
  }, [isLoading, isRefreshing, onLoadingChange]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const subscribeToSettingsUpdates = async () => {
      unlisten = await listen<HealthMonitoringConfig>(
        'health-settings-updated',
        (event) => {
          setConfig(event.payload);
          void fetchHealthSummary(false);
        },
      );
    };

    void subscribeToSettingsUpdates();

    return () => {
      if (unlisten) {
        void unlisten();
      }
    };
  }, [fetchHealthSummary]);

  const openSettingsWindow = useCallback(async () => {
    try {
      const existingWindow = await WebviewWindow.getByLabel(
        HEALTH_SETTINGS_WINDOW_LABEL,
      );

      if (existingWindow) {
        await existingWindow.show();
        await existingWindow.setFocus();
        return;
      }

      const settingsWindow = new WebviewWindow(HEALTH_SETTINGS_WINDOW_LABEL, {
        title: 'Health Settings',
        width: 540,
        height: 820,
        minWidth: 500,
        minHeight: 680,
        center: true,
        resizable: true,
      });

      settingsWindow.once('tauri://error', (event) => {
        console.error('Failed to create health settings window:', event);
      });
    } catch (err) {
      console.error('Failed to open health settings window:', err);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => {
        void fetchHealthSummary(false);
      },
      openSettings: () => {
        void openSettingsWindow();
      },
    }),
    [fetchHealthSummary, openSettingsWindow],
  );

  // Trigger recovery
  const handleRecovery = async (instanceId: string) => {
    setIsRecovering(instanceId);
    try {
      await invoke('trigger_instance_recovery', {
        clawpitDir,
        instanceId,
        wslDistro,
      });

      // Send notification if enabled
      if (config?.notificationsEnabled) {
        try {
          await invoke('send_health_notification', {
            title: 'Recovery Triggered',
            body: `Recovery triggered for instance ${instanceId}`,
          });
        } catch {
          // Notification might fail, that's ok
        }
      }

      // Refresh after a delay
      setTimeout(fetchHealthSummary, 3000);
    } catch (err) {
      console.error('Recovery failed:', err);
    } finally {
      setIsRecovering(null);
    }
  };

  // Get status color and icon
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'healthy':
        return {
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          icon: CheckCircle,
          label: 'Healthy',
        };
      case 'degraded':
        return {
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          icon: AlertTriangle,
          label: 'Degraded',
        };
      case 'critical':
        return {
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          icon: AlertCircle,
          label: 'Critical',
        };
      default:
        return {
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          icon: Heart,
          label: 'Unknown',
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const statusInfo = summary ? getStatusInfo(summary.overallStatus) : null;
  const StatusIcon = statusInfo?.icon || Heart;

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HeartPulse className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Health Monitor
              </h2>
              <p className="text-muted-foreground">
                System health and resource monitoring
              </p>
            </div>
          </div>
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg hover:bg-muted"
                    onClick={() => {
                      void fetchHealthSummary(false);
                    }}
                    disabled={isLoading || isRefreshing}
                  >
                    <RefreshCw
                      className={cn(
                        'h-4 w-4',
                        (isLoading || isRefreshing) && 'animate-spin',
                      )}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg hover:bg-muted"
                    onClick={() => {
                      void openSettingsWindow();
                    }}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* Overall Status Card */}
      {summary && (
        <Card className={cn('border-2', statusInfo?.bgColor)}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn('p-3 rounded-full', statusInfo?.bgColor)}>
                  <StatusIcon className={cn('h-8 w-8', statusInfo?.color)} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{statusInfo?.label}</h3>
                  <p className="text-muted-foreground">
                    {summary.healthyInstances} healthy,{' '}
                    {summary.degradedInstances} degraded,{' '}
                    {summary.criticalInstances} critical
                  </p>
                </div>
              </div>

              {/* Alert badges */}
              <div className="flex items-center gap-2">
                {summary.activeAlerts.critical > 0 && (
                  <Badge variant="destructive">
                    {summary.activeAlerts.critical} Critical
                  </Badge>
                )}
                {summary.activeAlerts.warning > 0 && (
                  <Badge variant="secondary">
                    {summary.activeAlerts.warning} Warning
                  </Badge>
                )}
                {summary.activeAlerts.info > 0 && (
                  <Badge variant="outline">
                    {summary.activeAlerts.info} Info
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instance Metrics Grid */}
      {summary && summary.instances.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {summary.instances.map((instance) => (
            <InstanceHealthCard
              key={instance.instanceId}
              metrics={instance}
              config={config}
              onRecovery={() => handleRecovery(instance.instanceId)}
              isRecovering={isRecovering === instance.instanceId}
            />
          ))}
        </div>
      )}

      {/* No instances */}
      {summary && summary.instances.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Heart className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No instances to monitor. Create an instance to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Alerts Section */}
      {summary && summary.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Active Alerts ({summary.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HealthAlertList alerts={summary.alerts} />
          </CardContent>
        </Card>
      )}
    </div>
  );
});

// Instance Health Card Component
interface InstanceHealthCardProps {
  metrics: HealthMetrics;
  config: HealthMonitoringConfig | null;
  onRecovery: () => void;
  isRecovering: boolean;
}

function InstanceHealthCard({
  metrics,
  config,
  onRecovery,
  isRecovering,
}: InstanceHealthCardProps) {
  const isRunning = metrics.containerState === 'running';
  const isHealthy = metrics.containerHealth !== 'unhealthy';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{metrics.instanceName}</CardTitle>
          <div className="flex items-center gap-2">
            {metrics.gatewayReachable ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <Badge
              variant={
                isRunning && isHealthy
                  ? 'default'
                  : isRunning
                    ? 'secondary'
                    : 'destructive'
              }
            >
              {metrics.containerState}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CPU Usage */}
        <MetricBar
          icon={Cpu}
          label="CPU"
          value={metrics.cpuPercent}
          threshold={config?.cpuThresholdPercent || 90}
        />

        {/* Memory Usage */}
        <MetricBar
          icon={MemoryStick}
          label="Memory"
          value={metrics.memoryPercent}
          threshold={config?.memoryThresholdPercent || 85}
          detail={
            metrics.memoryUsedMb && metrics.memoryLimitMb
              ? `${metrics.memoryUsedMb.toFixed(0)} / ${metrics.memoryLimitMb.toFixed(0)} MB`
              : undefined
          }
        />

        {/* Disk Usage */}
        <MetricBar
          icon={HardDrive}
          label="Disk"
          value={metrics.diskPercent}
          threshold={config?.diskThresholdPercent || 90}
          detail={
            metrics.diskUsedGb && metrics.diskTotalGb
              ? `${metrics.diskUsedGb.toFixed(1)} / ${metrics.diskTotalGb.toFixed(1)} GB`
              : undefined
          }
        />

        {/* Containers */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Containers</span>
          <span>
            {metrics.runningContainers} / {metrics.totalContainers} running
          </span>
        </div>

        {/* Recovery button for stopped/unhealthy containers */}
        {(!isRunning || !isHealthy) && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-muted mx-auto"
                  onClick={onRecovery}
                  disabled={isRecovering}
                >
                  {isRecovering ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isRecovering ? 'Recovering...' : 'Trigger Recovery'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}

// Metric Bar Component
interface MetricBarProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  threshold: number;
  detail?: string;
}

function MetricBar({
  icon: Icon,
  label,
  value,
  threshold,
  detail,
}: MetricBarProps) {
  const percentage = value ?? 0;
  const isWarning = percentage > threshold;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {detail && (
            <span className="text-xs text-muted-foreground">{detail}</span>
          )}
          <span className={cn(isWarning && 'text-yellow-500 font-medium')}>
            {value !== null ? `${value.toFixed(1)}%` : 'N/A'}
          </span>
        </div>
      </div>
      <Progress
        value={percentage}
        className={cn('h-2', isWarning && '[&>div]:bg-yellow-500')}
      />
    </div>
  );
}

export default HealthMonitor;
