import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { InstanceConfig, SuggestedPorts } from '@/stores';

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (config: InstanceConfig) => Promise<void>;
  clawpitDir: string;
}

type Step = 'basic' | 'network' | 'providers' | 'review';

const STEPS: Step[] = ['basic', 'network', 'providers', 'review'];

const STEP_TITLES: Record<Step, string> = {
  basic: 'Basic Information',
  network: 'Network Configuration',
  providers: 'Messaging Providers',
  review: 'Review & Create',
};

export function CreateInstanceDialog({
  open,
  onOpenChange,
  onSubmit,
  clawpitDir,
}: CreateInstanceDialogProps) {
  const [step, setStep] = useState<Step>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [config, setConfig] = useState<InstanceConfig>({
    id: '',
    name: '',
    description: '',
    gatewayPort: 18789,
    bridgePort: 18790,
    bindMode: 'local',
    authToken: '',
    tokenGenerated: false,
    providers: {
      whatsapp: false,
      telegram: { enabled: false, token: '' },
      discord: { enabled: false, token: '' },
    },
  });

  const loadSuggestedPorts = useCallback(async () => {
    try {
      const ports = await invoke<SuggestedPorts>('get_next_available_ports', {
        clawpitDir,
      });
      setConfig((prev) => ({
        ...prev,
        gatewayPort: ports.gatewayPort,
        bridgePort: ports.bridgePort,
      }));
    } catch {
      // Keep default ports if suggestion fails
    }
  }, [clawpitDir]);

  // Load suggested ports when dialog opens
  useEffect(() => {
    if (open) {
      loadSuggestedPorts();
      setStep('basic');
      setError(null);
    }
  }, [open, loadSuggestedPorts]);

  const generateId = (name: string): string => {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 32) || 'instance'
    );
  };

  const handleNameChange = (name: string) => {
    setConfig((prev) => ({
      ...prev,
      name,
      id: generateId(name),
    }));
  };

  const generateToken = useCallback(async () => {
    try {
      const token = await invoke<string>('generate_secure_token');
      setConfig((prev) => ({
        ...prev,
        authToken: token,
        tokenGenerated: true,
      }));
    } catch (err) {
      setError(`Failed to generate token: ${err}`);
    }
  }, []);

  const validateStep = (currentStep: Step): boolean => {
    switch (currentStep) {
      case 'basic':
        return config.name.trim().length >= 2 && config.id.length > 0;
      case 'network':
        return (
          config.gatewayPort > 1024 &&
          config.gatewayPort < 65535 &&
          config.bridgePort > 1024 &&
          config.bridgePort < 65535 &&
          config.gatewayPort !== config.bridgePort
        );
      case 'providers':
        // Providers are optional, but if enabled, tokens must be provided
        if (
          config.providers.telegram.enabled &&
          !config.providers.telegram.token
        ) {
          return false;
        }
        if (
          config.providers.discord.enabled &&
          !config.providers.discord.token
        ) {
          return false;
        }
        return true;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(config);
      onOpenChange(false);
      // Reset form
      setConfig({
        id: '',
        name: '',
        description: '',
        gatewayPort: 18789,
        bridgePort: 18790,
        bindMode: 'local',
        authToken: '',
        tokenGenerated: false,
        providers: {
          whatsapp: false,
          telegram: { enabled: false, token: '' },
          discord: { enabled: false, token: '' },
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create New Instance</DialogTitle>
          <DialogDescription>
            Step {stepIndex + 1} of {STEPS.length}: {STEP_TITLES[step]}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="py-4">
          {/* Step: Basic Information */}
          {step === 'basic' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Instance Name *</Label>
                <Input
                  id="name"
                  value={config.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Production, Development, Testing"
                />
                <p className="text-xs text-muted-foreground">
                  ID: {config.id || 'auto-generated from name'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={config.description}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="What will this instance be used for?"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step: Network Configuration */}
          {step === 'network' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gatewayPort">Gateway Port *</Label>
                  <Input
                    id="gatewayPort"
                    type="number"
                    min={1025}
                    max={65534}
                    value={config.gatewayPort}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        gatewayPort:
                          Number.parseInt(e.target.value, 10) || 18789,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bridgePort">Bridge Port *</Label>
                  <Input
                    id="bridgePort"
                    type="number"
                    min={1025}
                    max={65534}
                    value={config.bridgePort}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        bridgePort:
                          Number.parseInt(e.target.value, 10) || 18790,
                      }))
                    }
                  />
                </div>
              </div>

              {config.gatewayPort === config.bridgePort && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Gateway and Bridge ports must be different
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <Label>Network Binding</Label>
                <RadioGroup
                  value={config.bindMode}
                  onValueChange={(value) =>
                    setConfig((prev) => ({
                      ...prev,
                      bindMode: value as 'local' | 'lan',
                    }))
                  }
                >
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="local" id="bind-local" />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="bind-local"
                        className="font-normal cursor-pointer"
                      >
                        Localhost only (recommended)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Only accessible from this computer (127.0.0.1)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="lan" id="bind-lan" />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="bind-lan"
                        className="font-normal cursor-pointer"
                      >
                        LAN accessible
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Accessible from other devices on your network (0.0.0.0)
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="authToken">Authentication Token</Label>
                <div className="flex gap-2">
                  <Input
                    id="authToken"
                    type="password"
                    value={config.authToken}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        authToken: e.target.value,
                        tokenGenerated: false,
                      }))
                    }
                    placeholder="Leave empty for no authentication"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={generateToken}
                    title="Generate secure token"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {config.authToken
                    ? config.tokenGenerated
                      ? 'Auto-generated secure token'
                      : 'Custom token'
                    : 'No authentication - anyone can access the API'}
                </p>
              </div>
            </div>
          )}

          {/* Step: Providers */}
          {step === 'providers' && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Enable the messaging providers you want to use with this
                instance. You can configure these later.
              </p>

              {/* WhatsApp */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">WhatsApp</Label>
                  <p className="text-sm text-muted-foreground">
                    Connect to WhatsApp via WhatsApp Web
                  </p>
                </div>
                <Switch
                  checked={config.providers.whatsapp}
                  onCheckedChange={(checked) =>
                    setConfig((prev) => ({
                      ...prev,
                      providers: { ...prev.providers, whatsapp: checked },
                    }))
                  }
                />
              </div>

              {/* Telegram */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Telegram</Label>
                    <p className="text-sm text-muted-foreground">
                      Connect to Telegram via Bot API
                    </p>
                  </div>
                  <Switch
                    checked={config.providers.telegram.enabled}
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        providers: {
                          ...prev.providers,
                          telegram: {
                            ...prev.providers.telegram,
                            enabled: checked,
                          },
                        },
                      }))
                    }
                  />
                </div>
                {config.providers.telegram.enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="telegram-token">Bot Token *</Label>
                    <Input
                      id="telegram-token"
                      type="password"
                      value={config.providers.telegram.token}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          providers: {
                            ...prev.providers,
                            telegram: {
                              ...prev.providers.telegram,
                              token: e.target.value,
                            },
                          },
                        }))
                      }
                      placeholder="Enter your Telegram bot token"
                    />
                  </div>
                )}
              </div>

              {/* Discord */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Discord</Label>
                    <p className="text-sm text-muted-foreground">
                      Connect to Discord via Bot API
                    </p>
                  </div>
                  <Switch
                    checked={config.providers.discord.enabled}
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        providers: {
                          ...prev.providers,
                          discord: {
                            ...prev.providers.discord,
                            enabled: checked,
                          },
                        },
                      }))
                    }
                  />
                </div>
                {config.providers.discord.enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="discord-token">Bot Token *</Label>
                    <Input
                      id="discord-token"
                      type="password"
                      value={config.providers.discord.token}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          providers: {
                            ...prev.providers,
                            discord: {
                              ...prev.providers.discord,
                              token: e.target.value,
                            },
                          },
                        }))
                      }
                      placeholder="Enter your Discord bot token"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-3">
                <h4 className="font-medium">Instance Details</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd>{config.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">ID</dt>
                    <dd className="font-mono text-xs">{config.id}</dd>
                  </div>
                  {config.description && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Description</dt>
                      <dd className="text-right max-w-[200px] truncate">
                        {config.description}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <h4 className="font-medium">Network</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Gateway Port</dt>
                    <dd>{config.gatewayPort}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Bridge Port</dt>
                    <dd>{config.bridgePort}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Binding</dt>
                    <dd>
                      {config.bindMode === 'local' ? 'Localhost only' : 'LAN'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Authentication</dt>
                    <dd>{config.authToken ? 'Enabled' : 'Disabled'}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <h4 className="font-medium">Providers</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">WhatsApp</dt>
                    <dd>
                      {config.providers.whatsapp ? 'Enabled' : 'Disabled'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Telegram</dt>
                    <dd>
                      {config.providers.telegram.enabled
                        ? 'Enabled'
                        : 'Disabled'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Discord</dt>
                    <dd>
                      {config.providers.discord.enabled
                        ? 'Enabled'
                        : 'Disabled'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => (stepIndex > 0 ? handleBack() : onOpenChange(false))}
            disabled={isSubmitting}
          >
            {stepIndex > 0 ? 'Back' : 'Cancel'}
          </Button>

          {step !== 'review' ? (
            <Button onClick={handleNext} disabled={!validateStep(step)}>
              Next
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create Instance
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
