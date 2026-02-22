import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FirewallGuidance } from '@/components/network';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { useWizardStore } from '@/stores';

interface PortConflictResult {
  available: boolean;
  systemInUse: boolean;
  conflictingInstance: string | null;
  suggestedPort: number | null;
  error: string | null;
}

export function NetworkStep() {
  const { data, updateInstance, markStepComplete } = useWizardStore();
  const { instance, clawpitDir } = data;

  const [gatewayPortStatus, setGatewayPortStatus] =
    useState<PortConflictResult | null>(null);
  const [bridgePortStatus, setBridgePortStatus] =
    useState<PortConflictResult | null>(null);
  const [checkingPorts, setCheckingPorts] = useState(false);

  // Check port availability with conflict detection
  const checkPorts = useCallback(async () => {
    if (!clawpitDir) return;

    setCheckingPorts(true);

    try {
      const [gateway, bridge] = await Promise.all([
        invoke<PortConflictResult>('check_port_with_conflicts', {
          clawpitDir,
          port: instance.gatewayPort,
          currentInstanceId: instance.id || null,
        }),
        invoke<PortConflictResult>('check_port_with_conflicts', {
          clawpitDir,
          port: instance.bridgePort,
          currentInstanceId: instance.id || null,
        }),
      ]);

      setGatewayPortStatus(gateway);
      setBridgePortStatus(bridge);

      // Mark step complete if both ports are available and different
      if (
        gateway.available &&
        bridge.available &&
        instance.gatewayPort !== instance.bridgePort
      ) {
        markStepComplete('network');
      }
    } catch (err) {
      // Fallback to basic check if enhanced check not available
      console.warn(
        'Enhanced port check not available, using basic check:',
        err,
      );
      try {
        const [gateway, bridge] = await Promise.all([
          invoke<{ available: boolean; error?: string }>(
            'check_port_available',
            {
              port: instance.gatewayPort,
            },
          ),
          invoke<{ available: boolean; error?: string }>(
            'check_port_available',
            {
              port: instance.bridgePort,
            },
          ),
        ]);

        setGatewayPortStatus({
          available: gateway.available,
          systemInUse: !gateway.available,
          conflictingInstance: null,
          suggestedPort: null,
          error: gateway.error || null,
        });
        setBridgePortStatus({
          available: bridge.available,
          systemInUse: !bridge.available,
          conflictingInstance: null,
          suggestedPort: null,
          error: bridge.error || null,
        });

        if (gateway.available && bridge.available) {
          markStepComplete('network');
        }
      } catch {
        // Final fallback - assume ports are fine
        setGatewayPortStatus({
          available: true,
          systemInUse: false,
          conflictingInstance: null,
          suggestedPort: null,
          error: null,
        });
        setBridgePortStatus({
          available: true,
          systemInUse: false,
          conflictingInstance: null,
          suggestedPort: null,
          error: null,
        });
        markStepComplete('network');
      }
    } finally {
      setCheckingPorts(false);
    }
  }, [
    clawpitDir,
    instance.gatewayPort,
    instance.bridgePort,
    instance.id,
    markStepComplete,
  ]);

  // Check ports on mount and when ports change
  useEffect(() => {
    const debounce = setTimeout(checkPorts, 500);
    return () => clearTimeout(debounce);
  }, [checkPorts]);

  // Handle port change
  const handlePortChange = (
    field: 'gatewayPort' | 'bridgePort',
    value: string,
  ) => {
    const port = Number.parseInt(value, 10);
    if (!Number.isNaN(port) && port >= 1 && port <= 65535) {
      updateInstance({ [field]: port });
    }
  };

  // Apply suggested port
  const applySuggestedPort = (
    field: 'gatewayPort' | 'bridgePort',
    port: number,
  ) => {
    updateInstance({ [field]: port });
  };

  // Handle bind mode change
  const handleBindModeChange = (value: string) => {
    updateInstance({ bindMode: value as 'local' | 'lan' });
  };

  // Validate port
  const isValidPort = (port: number) => port >= 1024 && port <= 65535;

  // Render port status badge
  const renderPortStatus = (
    status: PortConflictResult | null,
    field: 'gatewayPort' | 'bridgePort',
  ) => {
    if (checkingPorts) {
      return <Spinner size="sm" />;
    }

    if (!status) return null;

    if (status.available) {
      return (
        <Badge variant="outline" className="text-success border-success">
          Available
        </Badge>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="text-destructive border-destructive"
        >
          {status.conflictingInstance ? 'Conflict' : 'In use'}
        </Badge>
        {status.suggestedPort && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => applySuggestedPort(field, status.suggestedPort ?? 0)}
          >
            Use {status.suggestedPort}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">Network Settings</h2>
        <p className="text-muted-foreground mt-1">
          Configure network ports and access settings for this instance.
        </p>
      </div>

      {/* Port Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Port Configuration</CardTitle>
              <CardDescription>
                OpenClaw uses two ports: one for the gateway API and one for the
                bridge service.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={checkPorts}
              disabled={checkingPorts}
            >
              <RefreshCw
                className={cn('h-4 w-4', checkingPorts && 'animate-spin')}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Gateway Port */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gateway-port">Gateway Port</Label>
              <div className="relative">
                <Input
                  id="gateway-port"
                  type="number"
                  min={1024}
                  max={65535}
                  value={instance.gatewayPort}
                  onChange={(e) =>
                    handlePortChange('gatewayPort', e.target.value)
                  }
                  className={cn(
                    'font-mono pr-24',
                    gatewayPortStatus &&
                      !gatewayPortStatus.available &&
                      'border-destructive',
                  )}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {renderPortStatus(gatewayPortStatus, 'gatewayPort')}
                </div>
              </div>
              {!isValidPort(instance.gatewayPort) && (
                <p className="text-xs text-destructive">
                  Port must be between 1024 and 65535
                </p>
              )}
              {gatewayPortStatus?.conflictingInstance && (
                <p className="text-xs text-destructive">
                  Used by instance "{gatewayPortStatus.conflictingInstance}"
                </p>
              )}
            </div>

            {/* Bridge Port */}
            <div className="space-y-2">
              <Label htmlFor="bridge-port">Bridge Port</Label>
              <div className="relative">
                <Input
                  id="bridge-port"
                  type="number"
                  min={1024}
                  max={65535}
                  value={instance.bridgePort}
                  onChange={(e) =>
                    handlePortChange('bridgePort', e.target.value)
                  }
                  className={cn(
                    'font-mono pr-24',
                    bridgePortStatus &&
                      !bridgePortStatus.available &&
                      'border-destructive',
                  )}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {renderPortStatus(bridgePortStatus, 'bridgePort')}
                </div>
              </div>
              {!isValidPort(instance.bridgePort) && (
                <p className="text-xs text-destructive">
                  Port must be between 1024 and 65535
                </p>
              )}
              {bridgePortStatus?.conflictingInstance && (
                <p className="text-xs text-destructive">
                  Used by instance "{bridgePortStatus.conflictingInstance}"
                </p>
              )}
            </div>
          </div>

          {/* Port conflict warning */}
          {instance.gatewayPort === instance.bridgePort && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Gateway and Bridge ports must be different
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Binding Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Network Binding</CardTitle>
          <CardDescription>
            Choose how OpenClaw should be accessible on your network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={instance.bindMode}
            onValueChange={handleBindModeChange}
            className="space-y-3"
          >
            <button
              type="button"
              className={cn(
                'flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors text-left w-full',
                instance.bindMode === 'local'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50',
              )}
              onClick={() => handleBindModeChange('local')}
            >
              <RadioGroupItem value="local" id="bind-local" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="bind-local" className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Local Only</span>
                    <Badge variant="secondary" className="text-xs">
                      Recommended
                    </Badge>
                  </div>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Only accessible from this computer (127.0.0.1). More secure
                  for personal use.
                </p>
              </div>
            </button>

            <button
              type="button"
              className={cn(
                'flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors text-left w-full',
                instance.bindMode === 'lan'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50',
              )}
              onClick={() => handleBindModeChange('lan')}
            >
              <RadioGroupItem value="lan" id="bind-lan" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="bind-lan" className="cursor-pointer">
                  <span className="font-medium">LAN Access</span>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Accessible from other devices on your local network (0.0.0.0).
                  Useful for accessing from your phone or other computers.
                </p>
              </div>
            </button>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Security Note for LAN */}
      {instance.bindMode === 'lan' && (
        <Alert className="bg-warning/10 border-warning/20">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription>
            <span className="font-medium text-warning">Security Note: </span>
            With LAN access enabled, anyone on your local network can access
            OpenClaw. Make sure you trust all devices on your network, and
            consider using a strong authentication token.
          </AlertDescription>
        </Alert>
      )}

      {/* Firewall Guidance */}
      <FirewallGuidance
        gatewayPort={instance.gatewayPort}
        bridgePort={instance.bridgePort}
        bindMode={instance.bindMode}
      />

      {/* Access URLs Preview */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <h4 className="text-sm font-medium mb-2">Access URLs</h4>
          <div className="space-y-1 text-sm font-mono">
            <p>
              <span className="text-muted-foreground">Gateway:</span> http://
              {instance.bindMode === 'local' ? 'localhost' : '<your-ip>'}:
              {instance.gatewayPort}
            </p>
            <p>
              <span className="text-muted-foreground">Bridge:</span> http://
              {instance.bindMode === 'local' ? 'localhost' : '<your-ip>'}:
              {instance.bridgePort}
            </p>
          </div>
          {instance.bindMode === 'lan' && (
            <p className="text-xs text-muted-foreground mt-2">
              Replace {'<your-ip>'} with your computer's local IP address (e.g.,
              192.168.1.100)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default NetworkStep;
