import {
  Bell,
  Cpu,
  HardDrive,
  HeartPulse,
  MemoryStick,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
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

interface HealthSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: HealthMonitoringConfig;
  onSave: (config: HealthMonitoringConfig) => void;
}

export function HealthSettingsDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: HealthSettingsDialogProps) {
  const [localConfig, setLocalConfig] =
    useState<HealthMonitoringConfig>(config);

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      setLocalConfig(config);
    }
  }, [open, config]);

  const handleSave = () => {
    onSave(localConfig);
  };

  const updateConfig = (updates: Partial<HealthMonitoringConfig>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Health Monitoring Settings
          </DialogTitle>
          <DialogDescription>
            Configure thresholds and monitoring behavior.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enable Monitoring */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Monitoring</Label>
              <p className="text-xs text-muted-foreground">
                Automatically check system health
              </p>
            </div>
            <Switch
              checked={localConfig.enabled}
              onCheckedChange={(enabled) => updateConfig({ enabled })}
            />
          </div>

          <Separator />

          {/* Check Interval */}
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
              How often to check health status (10-120 seconds)
            </p>
          </div>

          <Separator />

          {/* Thresholds */}
          <div className="space-y-4">
            <Label>Alert Thresholds</Label>

            {/* CPU Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
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

            {/* Memory Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
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

            {/* Disk Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
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

          {/* Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </Label>
              <p className="text-xs text-muted-foreground">
                Show desktop notifications for alerts
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

          {/* Auto-Recovery */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Recovery</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically restart failed containers
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
                    onChange={(e) =>
                      updateConfig({
                        maxRecoveryAttempts:
                          Number.parseInt(e.target.value, 10) || 1,
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
                    onChange={(e) =>
                      updateConfig({
                        recoveryCooldownSecs:
                          Number.parseInt(e.target.value, 10) || 30,
                      })
                    }
                    min={30}
                    max={300}
                    disabled={!localConfig.enabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    Time between recovery attempts
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default HealthSettingsDialog;
