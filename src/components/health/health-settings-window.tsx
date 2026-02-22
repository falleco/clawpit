import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Bell,
  Cpu,
  HardDrive,
  HeartPulse,
  MemoryStick,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

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

const WINDOW = getCurrentWindow();

export function HealthSettingsWindow() {
  const [config, setConfig] = useState<HealthMonitoringConfig | null>(null);
  const [localConfig, setLocalConfig] = useState<HealthMonitoringConfig | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setIsLoading(true);
        const result = await invoke<HealthMonitoringConfig>(
          'get_health_monitoring_config',
        );
        setConfig(result);
        setLocalConfig(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };

    void loadConfig();
  }, []);

  const updateConfig = (updates: Partial<HealthMonitoringConfig>) => {
    setLocalConfig((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        ...updates,
      };
    });
  };

  const handleCancel = async () => {
    await WINDOW.close();
  };

  const handleSave = async () => {
    if (!localConfig) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await invoke('save_health_monitoring_config', { config: localConfig });
      await WINDOW.emitTo('main', 'health-settings-updated', localConfig);
      await WINDOW.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSaving(false);
    }
  };

  if (isLoading || !localConfig || !config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-auto bg-background px-6 py-5 text-foreground">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <HeartPulse className="h-5 w-5" />
              Health Monitoring Settings
            </CardTitle>
            <CardDescription>
              Configure thresholds, check cadence, and automatic recovery
              behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Monitoring</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically check instance health.
                </p>
              </div>
              <Switch
                checked={localConfig.enabled}
                onCheckedChange={(enabled) => updateConfig({ enabled })}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Check Interval
                </Label>
                <span className="text-sm text-muted-foreground">
                  {localConfig.checkIntervalSecs}s
                </span>
              </div>
              <Slider
                value={[localConfig.checkIntervalSecs]}
                onValueChange={([value]) =>
                  updateConfig({ checkIntervalSecs: value })
                }
                min={10}
                max={120}
                step={5}
                disabled={!localConfig.enabled}
              />
              <p className="text-xs text-muted-foreground">
                How often health status is checked (10-120 seconds).
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label>Alert Thresholds</Label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    CPU Usage
                  </span>
                  <span className="text-sm">
                    {localConfig.cpuThresholdPercent}%
                  </span>
                </div>
                <Slider
                  value={[localConfig.cpuThresholdPercent]}
                  onValueChange={([value]) =>
                    updateConfig({ cpuThresholdPercent: value })
                  }
                  min={50}
                  max={100}
                  step={5}
                  disabled={!localConfig.enabled}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <MemoryStick className="h-4 w-4 text-muted-foreground" />
                    Memory Usage
                  </span>
                  <span className="text-sm">
                    {localConfig.memoryThresholdPercent}%
                  </span>
                </div>
                <Slider
                  value={[localConfig.memoryThresholdPercent]}
                  onValueChange={([value]) =>
                    updateConfig({ memoryThresholdPercent: value })
                  }
                  min={50}
                  max={100}
                  step={5}
                  disabled={!localConfig.enabled}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    Disk Usage
                  </span>
                  <span className="text-sm">
                    {localConfig.diskThresholdPercent}%
                  </span>
                </div>
                <Slider
                  value={[localConfig.diskThresholdPercent]}
                  onValueChange={([value]) =>
                    updateConfig({ diskThresholdPercent: value })
                  }
                  min={50}
                  max={100}
                  step={5}
                  disabled={!localConfig.enabled}
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Show desktop notifications for health alerts.
                </p>
              </div>
              <Switch
                checked={localConfig.notificationsEnabled}
                onCheckedChange={(notificationsEnabled) =>
                  updateConfig({ notificationsEnabled })
                }
                disabled={!localConfig.enabled}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-Recovery</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically restart unhealthy or stopped containers.
                  </p>
                </div>
                <Switch
                  checked={localConfig.autoRecoveryEnabled}
                  onCheckedChange={(autoRecoveryEnabled) =>
                    updateConfig({ autoRecoveryEnabled })
                  }
                  disabled={!localConfig.enabled}
                />
              </div>

              {localConfig.autoRecoveryEnabled && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm">Max Recovery Attempts</Label>
                    <Input
                      type="number"
                      value={localConfig.maxRecoveryAttempts}
                      onChange={(event) =>
                        updateConfig({
                          maxRecoveryAttempts:
                            Number.parseInt(event.target.value, 10) || 1,
                        })
                      }
                      min={1}
                      max={10}
                      disabled={!localConfig.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Cooldown (seconds)</Label>
                    <Input
                      type="number"
                      value={localConfig.recoveryCooldownSecs}
                      onChange={(event) =>
                        updateConfig({
                          recoveryCooldownSecs:
                            Number.parseInt(event.target.value, 10) || 30,
                        })
                      }
                      min={30}
                      max={300}
                      disabled={!localConfig.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Time between recovery attempts.
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2 pb-2">
          <Button
            variant="outline"
            onClick={() => void handleCancel()}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={
              isSaving || JSON.stringify(localConfig) === JSON.stringify(config)
            }
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default HealthSettingsWindow;
