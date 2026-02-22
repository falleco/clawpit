import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  RefreshCw,
  Shield,
  Square,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import type { CoreServicesStatus } from '@/types';

interface CoreServicesMonitorProps {
  clawpitDir: string;
  wslDistro?: string;
  compact?: boolean;
}

export function CoreServicesMonitor({
  clawpitDir,
  wslDistro,
  compact = false,
}: CoreServicesMonitorProps) {
  const [status, setStatus] = useState<CoreServicesStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<CoreServicesStatus>(
        'get_core_services_status',
        {
          clawpitDir,
          wslDistro,
        },
      );
      setStatus(result);
    } catch (err) {
      setError(err as string);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [clawpitDir, wslDistro]);

  useEffect(() => {
    fetchStatus();
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStart = async () => {
    setIsActionRunning(true);
    try {
      await invoke('ensure_core_services', { clawpitDir, wslDistro });
      await fetchStatus();
    } catch (err) {
      setError(err as string);
    } finally {
      setIsActionRunning(false);
    }
  };

  const handleStop = async () => {
    setIsActionRunning(true);
    try {
      await invoke('stop_core_services', { clawpitDir, wslDistro });
      await fetchStatus();
    } catch (err) {
      setError(err as string);
    } finally {
      setIsActionRunning(false);
    }
  };

  const handleRestart = async () => {
    setIsActionRunning(true);
    try {
      await invoke('stop_core_services', { clawpitDir, wslDistro });
      await invoke('ensure_core_services', { clawpitDir, wslDistro });
      await fetchStatus();
    } catch (err) {
      setError(err as string);
    } finally {
      setIsActionRunning(false);
    }
  };

  const getOverallStatus = () => {
    if (!status) return 'unknown';
    if (!status.installed) return 'not_installed';
    if (status.running && status.egressHealthy && status.networksCreated)
      return 'healthy';
    if (status.running) return 'degraded';
    return 'stopped';
  };

  const overallStatus = getOverallStatus();

  const statusConfig = {
    healthy: {
      label: 'Healthy',
      variant: 'default' as const,
      icon: CheckCircle2,
      color: 'text-green-500',
    },
    degraded: {
      label: 'Degraded',
      variant: 'secondary' as const,
      icon: AlertTriangle,
      color: 'text-yellow-500',
    },
    stopped: {
      label: 'Stopped',
      variant: 'outline' as const,
      icon: XCircle,
      color: 'text-muted-foreground',
    },
    not_installed: {
      label: 'Not Installed',
      variant: 'outline' as const,
      icon: XCircle,
      color: 'text-muted-foreground',
    },
    unknown: {
      label: 'Unknown',
      variant: 'outline' as const,
      icon: AlertTriangle,
      color: 'text-muted-foreground',
    },
  };

  const currentStatus = statusConfig[overallStatus];
  const StatusIcon = currentStatus.icon;

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
        <div className={`p-2 rounded-md bg-muted ${currentStatus.color}`}>
          <Shield className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Security Proxy</span>
            <Badge variant={currentStatus.variant} className="text-xs">
              {currentStatus.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            Egress filtering & network isolation
          </p>
        </div>
        <div className="flex items-center gap-1">
          {overallStatus === 'stopped' || overallStatus === 'not_installed' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleStart}
              disabled={isActionRunning}
            >
              <Play className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRestart}
              disabled={isActionRunning}
            >
              <RefreshCw
                className={`h-3 w-3 ${isActionRunning ? 'animate-spin' : ''}`}
              />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Security Services</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={currentStatus.variant}>
              <StatusIcon className={`h-3 w-3 mr-1 ${currentStatus.color}`} />
              {currentStatus.label}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchStatus}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>
        <CardDescription>
          Egress proxy and network isolation for secure container operation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {status && (
          <div className="grid grid-cols-2 gap-3">
            <StatusItem label="Core Installed" ok={status.installed} />
            <StatusItem label="Services Running" ok={status.running} />
            <StatusItem label="Egress Proxy" ok={status.egressHealthy} />
            <StatusItem label="Networks Created" ok={status.networksCreated} />
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          {overallStatus === 'stopped' || overallStatus === 'not_installed' ? (
            <Button
              onClick={handleStart}
              disabled={isActionRunning}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Services
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleRestart}
                disabled={isActionRunning}
                className="flex-1"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isActionRunning ? 'animate-spin' : ''}`}
                />
                Restart
              </Button>
              <Button
                variant="outline"
                onClick={handleStop}
                disabled={isActionRunning}
              >
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          The security proxy filters all outbound traffic from OpenClaw
          containers, allowing only approved domains and IPs. Networks provide
          isolation between instances and the host system.
        </p>
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}

export default CoreServicesMonitor;
