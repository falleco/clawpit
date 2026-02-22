import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Switch,
  Textarea,
} from '@/components/ui';
import {
  clearSettingsDraft,
  clearSettingsSelectedInstanceId,
  loadSettingsCategory,
  loadSettingsDraft,
  loadSettingsSelectedInstanceId,
  type SettingsCategory,
  saveSettingsCategory,
  saveSettingsDraft,
  saveSettingsSelectedInstanceId,
} from '@/lib/settings-store';
import { useTheme } from '@/lib/theme';
import { type AppConfig, useConfigStore } from '@/stores';

function mergeConfig(base: AppConfig, updates: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...updates,
    network: {
      ...base.network,
      ...updates.network,
    },
    auth: {
      ...base.auth,
      ...updates.auth,
    },
    preferences: {
      ...base.preferences,
      ...updates.preferences,
    },
  };
}

function parsePort(raw: string, fallback: number): number {
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return Math.floor(parsed);
}

interface ConfigurableInstance {
  id: string;
  name: string;
}

interface ManagedEnvVar {
  key: string;
  value: string;
  description: string;
  defaultValue?: string;
  isCustom: boolean;
}

interface InstanceConfigurationBundle {
  openclawConfig: string;
  envVars: ManagedEnvVar[];
  composeFile: string;
  composeOverride: string;
  extraMounts: string[];
  additionalPackages: string[];
}

interface SaveOutcome {
  backupPaths: string[];
  restartRequired: boolean;
  message: string;
}

export function SettingsPage() {
  const { config, platform, isLoading, saveConfig, loadConfig, resetConfig } =
    useConfigStore();
  const { setTheme } = useTheme();

  const [category, setCategory] = useState<SettingsCategory>('general');
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [language, setLanguage] = useState('en');
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [instances, setInstances] = useState<ConfigurableInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [preferredInstanceId, setPreferredInstanceId] = useState<string | null>(
    null,
  );
  const [bundle, setBundle] = useState<InstanceConfigurationBundle | null>(
    null,
  );
  const [bundleLoading, setBundleLoading] = useState(false);
  const [openclawConfigText, setOpenclawConfigText] = useState('');
  const [composeOverrideText, setComposeOverrideText] = useState('');
  const [extraMountsText, setExtraMountsText] = useState('');
  const [additionalPackagesText, setAdditionalPackagesText] = useState('');
  const [envDraftValues, setEnvDraftValues] = useState<Record<string, string>>(
    {},
  );
  const [restartPrompt, setRestartPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!config) {
      return;
    }

    let cancelled = false;

    const loadDraft = async () => {
      try {
        const [storedCategory, storedDraft, storedInstanceId] =
          await Promise.all([
            loadSettingsCategory(),
            loadSettingsDraft(),
            loadSettingsSelectedInstanceId(),
          ]);

        if (cancelled) {
          return;
        }

        setCategory(storedCategory);
        setDraft(mergeConfig(config, storedDraft ?? {}));
        setPreferredInstanceId(storedInstanceId);
      } catch (error) {
        console.error('Failed to load settings draft:', error);
        setDraft(config);
      }
    };

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, [config]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    void saveSettingsDraft(draft);
  }, [draft]);

  useEffect(() => {
    void saveSettingsCategory(category);
  }, [category]);

  const hasChanges = useMemo(() => {
    if (!config || !draft) {
      return false;
    }
    return JSON.stringify(config) !== JSON.stringify(draft);
  }, [config, draft]);

  const applySaveOutcome = (outcome: SaveOutcome) => {
    setMessage({ type: 'success', text: outcome.message });
    if (outcome.restartRequired) {
      setRestartPrompt(
        'Changes were saved. Restart the instance to apply updates.',
      );
    }
  };

  const refreshBundle = useCallback(
    async (instanceId: string) => {
      if (!draft?.openclawDir) {
        return;
      }
      setBundleLoading(true);
      try {
        const loaded = await invoke<InstanceConfigurationBundle>(
          'get_instance_configuration_bundle',
          {
            clawpitDir: draft.openclawDir,
            instanceId,
          },
        );
        setBundle(loaded);
        setOpenclawConfigText(loaded.openclawConfig);
        setComposeOverrideText(loaded.composeOverride);
        setExtraMountsText(loaded.extraMounts.join('\n'));
        setAdditionalPackagesText(loaded.additionalPackages.join('\n'));
        setEnvDraftValues(
          loaded.envVars.reduce<Record<string, string>>((acc, item) => {
            acc[item.key] = item.value;
            return acc;
          }, {}),
        );
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBundleLoading(false);
      }
    },
    [draft?.openclawDir],
  );

  useEffect(() => {
    if (category !== 'advanced' || !draft?.openclawDir) {
      return;
    }

    let cancelled = false;
    const loadInstances = async () => {
      try {
        const loaded = await invoke<ConfigurableInstance[]>(
          'list_configurable_instances',
          {
            clawpitDir: draft.openclawDir,
          },
        );
        if (cancelled) {
          return;
        }
        setInstances(loaded);

        if (loaded.length === 0) {
          setSelectedInstanceId(null);
          setBundle(null);
          return;
        }

        const nextSelected =
          preferredInstanceId &&
          loaded.some((inst) => inst.id === preferredInstanceId)
            ? preferredInstanceId
            : selectedInstanceId &&
                loaded.some((inst) => inst.id === selectedInstanceId)
              ? selectedInstanceId
              : loaded[0].id;
        setSelectedInstanceId(nextSelected);
        if (preferredInstanceId) {
          setPreferredInstanceId(null);
          void clearSettingsSelectedInstanceId();
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void loadInstances();
    return () => {
      cancelled = true;
    };
  }, [category, draft?.openclawDir, preferredInstanceId, selectedInstanceId]);

  useEffect(() => {
    void saveSettingsSelectedInstanceId(selectedInstanceId);
  }, [selectedInstanceId]);

  useEffect(() => {
    if (category !== 'advanced' || !selectedInstanceId) {
      return;
    }
    void refreshBundle(selectedInstanceId);
  }, [category, selectedInstanceId, refreshBundle]);

  const updateDraft = (updates: Partial<AppConfig>) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return mergeConfig(current, updates);
    });
  };

  const updatePreference = <K extends keyof AppConfig['preferences']>(
    key: K,
    value: AppConfig['preferences'][K],
  ) => {
    if (key === 'theme') {
      setTheme(value as 'light' | 'dark' | 'system');
    }
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        preferences: {
          ...current.preferences,
          [key]: value,
        },
      };
    });
  };

  const updateNetwork = <K extends keyof AppConfig['network']>(
    key: K,
    value: AppConfig['network'][K],
  ) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        network: {
          ...current.network,
          [key]: value,
        },
      };
    });
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      const ok = await saveConfig(draft);
      if (!ok) {
        setMessage({ type: 'error', text: 'Failed to save settings.' });
        return;
      }

      await loadConfig();
      await clearSettingsDraft();
      setMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const reset = await resetConfig();
      if (!reset) {
        setMessage({ type: 'error', text: 'Failed to reset settings.' });
        return;
      }
      setDraft(reset);
      await clearSettingsDraft();
      setTheme(reset.preferences.theme);
      setMessage({ type: 'success', text: 'Settings reset to defaults.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const path = await save({
        defaultPath: 'clawpit-config.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (!path) {
        return;
      }

      await invoke('export_config_to_file', { filePath: path });
      setMessage({
        type: 'success',
        text: 'Configuration exported successfully.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (!path || Array.isArray(path)) {
        return;
      }

      const imported = await invoke<AppConfig>('import_config_from_file', {
        filePath: path,
      });
      setDraft(imported);
      setTheme(imported.preferences.theme);
      await loadConfig();
      await clearSettingsDraft();
      setMessage({
        type: 'success',
        text: 'Configuration imported successfully.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleSaveOpenclawConfig = async () => {
    if (!draft?.openclawDir || !selectedInstanceId) {
      return;
    }
    try {
      const outcome = await invoke<SaveOutcome>(
        'save_instance_openclaw_config',
        {
          clawpitDir: draft.openclawDir,
          instanceId: selectedInstanceId,
          content: openclawConfigText,
        },
      );
      applySaveOutcome(outcome);
      await refreshBundle(selectedInstanceId);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleSaveEnvVar = async (key: string) => {
    if (!draft?.openclawDir || !selectedInstanceId) {
      return;
    }

    try {
      const outcome = await invoke<SaveOutcome>('update_instance_env_var', {
        clawpitDir: draft.openclawDir,
        instanceId: selectedInstanceId,
        key,
        value: envDraftValues[key] ?? '',
      });
      applySaveOutcome(outcome);
      await refreshBundle(selectedInstanceId);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleResetEnvVar = async (key: string) => {
    if (!draft?.openclawDir || !selectedInstanceId) {
      return;
    }

    try {
      const outcome = await invoke<SaveOutcome>('reset_instance_env_var', {
        clawpitDir: draft.openclawDir,
        instanceId: selectedInstanceId,
        key,
      });
      applySaveOutcome(outcome);
      await refreshBundle(selectedInstanceId);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleSaveComposeCustomization = async () => {
    if (!draft?.openclawDir || !selectedInstanceId) {
      return;
    }

    try {
      const outcome = await invoke<SaveOutcome>(
        'save_instance_compose_customization',
        {
          clawpitDir: draft.openclawDir,
          instanceId: selectedInstanceId,
          composeOverride: composeOverrideText,
          extraMounts: extraMountsText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          additionalPackages: additionalPackagesText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        },
      );
      applySaveOutcome(outcome);
      await refreshBundle(selectedInstanceId);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleFactoryReset = async () => {
    if (!draft?.openclawDir) {
      return;
    }

    const confirmed = window.confirm(
      'Factory reset will move your current Clawpit workspace to a backup folder and recreate a clean structure. Continue?',
    );
    if (!confirmed) {
      return;
    }

    try {
      const outcome = await invoke<SaveOutcome>('factory_reset_clawpit', {
        clawpitDir: draft.openclawDir,
      });
      await resetConfig();
      await loadConfig();
      applySaveOutcome(outcome);
      setRestartPrompt('Factory reset completed. Re-run setup to continue.');
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!config || !draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Loading your configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Manage Clawpit behavior, networking, notifications, and advanced
            options.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <CategoryButton
              label="General"
              isActive={category === 'general'}
              onClick={() => setCategory('general')}
            />
            <CategoryButton
              label="Network"
              isActive={category === 'network'}
              onClick={() => setCategory('network')}
            />
            <CategoryButton
              label="Notifications"
              isActive={category === 'notifications'}
              onClick={() => setCategory('notifications')}
            />
            <CategoryButton
              label="Advanced"
              isActive={category === 'advanced'}
              onClick={() => setCategory('advanced')}
            />
          </div>

          {message && (
            <Alert
              variant={message.type === 'error' ? 'destructive' : 'default'}
            >
              <AlertTitle>
                {message.type === 'error' ? 'Error' : 'Success'}
              </AlertTitle>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {category === 'general' && (
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>
              Personalization and startup behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Language</Label>
              <RadioGroup
                value={language}
                onValueChange={(value) => setLanguage(value)}
                className="grid gap-2 sm:grid-cols-3"
              >
                <SettingRadio value="en" label="English" />
                <SettingRadio value="pt-BR" label="Portuguese (Brazil)" />
                <SettingRadio value="es" label="Spanish" />
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Theme</Label>
              <RadioGroup
                value={draft.preferences.theme}
                onValueChange={(value) =>
                  updatePreference(
                    'theme',
                    value as AppConfig['preferences']['theme'],
                  )
                }
                className="grid gap-2 sm:grid-cols-3"
              >
                <SettingRadio value="light" label="Light" />
                <SettingRadio value="dark" label="Dark" />
                <SettingRadio value="system" label="System" />
              </RadioGroup>
            </div>

            <SwitchRow
              label="Start on boot"
              description="Launch Clawpit automatically when your system starts."
              checked={draft.preferences.startOnBoot}
              onCheckedChange={(checked) =>
                updatePreference('startOnBoot', checked)
              }
            />
            <SwitchRow
              label="Start minimized"
              description="Keep Clawpit running in the background at startup."
              checked={draft.preferences.startMinimized}
              onCheckedChange={(checked) =>
                updatePreference('startMinimized', checked)
              }
            />
            <SwitchRow
              label="Minimize to tray on close"
              description="Closing the window keeps Clawpit active in the tray."
              checked={draft.preferences.minimizeToTray}
              onCheckedChange={(checked) =>
                updatePreference('minimizeToTray', checked)
              }
            />
          </CardContent>
        </Card>
      )}

      {category === 'network' && (
        <Card>
          <CardHeader>
            <CardTitle>Network Settings</CardTitle>
            <CardDescription>
              Ports, binding mode, and connectivity options.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup label="Gateway Port">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.network.gatewayPort}
                  onChange={(event) =>
                    updateNetwork(
                      'gatewayPort',
                      parsePort(event.target.value, draft.network.gatewayPort),
                    )
                  }
                />
              </FieldGroup>

              <FieldGroup label="Bridge Port">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.network.bridgePort}
                  onChange={(event) =>
                    updateNetwork(
                      'bridgePort',
                      parsePort(event.target.value, draft.network.bridgePort),
                    )
                  }
                />
              </FieldGroup>
            </div>

            <div className="space-y-2">
              <Label>Gateway Binding</Label>
              <RadioGroup
                value={draft.network.bindMode}
                onValueChange={(value) =>
                  updateNetwork(
                    'bindMode',
                    value as AppConfig['network']['bindMode'],
                  )
                }
                className="grid gap-2 sm:grid-cols-2"
              >
                <SettingRadio value="local" label="Local only (127.0.0.1)" />
                <SettingRadio value="lan" label="LAN (0.0.0.0)" />
              </RadioGroup>
            </div>

            <FieldGroup label="Proxy URL (optional)">
              <Input placeholder="http://proxy.local:8080" />
            </FieldGroup>

            {platform === 'windows' && (
              <FieldGroup label="WSL Distribution">
                <Input
                  value={draft.wslDistro ?? ''}
                  onChange={(event) =>
                    updateDraft({
                      wslDistro: event.target.value.trim() || undefined,
                    })
                  }
                  placeholder="Ubuntu"
                />
              </FieldGroup>
            )}
          </CardContent>
        </Card>
      )}

      {category === 'notifications' && (
        <Card>
          <CardHeader>
            <CardTitle>Notification Settings</CardTitle>
            <CardDescription>
              Control alerts and background monitoring feedback.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SwitchRow
              label="Enable notifications"
              description="Show desktop notifications for important events."
              checked={draft.preferences.notificationsEnabled}
              onCheckedChange={(checked) =>
                updatePreference('notificationsEnabled', checked)
              }
            />
            <SwitchRow
              label="Auto-restart on failure"
              description="Attempt automatic restart when a gateway becomes unavailable."
              checked={draft.preferences.autoRestart}
              onCheckedChange={(checked) =>
                updatePreference('autoRestart', checked)
              }
            />
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() =>
                  invoke('send_health_notification', {
                    title: 'Clawpit Notification Test',
                    body: 'Notifications are enabled and working correctly.',
                  })
                }
              >
                Send Test Notification
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {category === 'advanced' && (
        <Card>
          <CardHeader>
            <CardTitle>Advanced Settings</CardTitle>
            <CardDescription>
              Paths, configuration editors, environment management, and compose
              customization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4">
              <FieldGroup label="OpenClaw Directory">
                <Input
                  value={draft.openclawDir}
                  onChange={(event) =>
                    updateDraft({ openclawDir: event.target.value })
                  }
                />
              </FieldGroup>
              <FieldGroup label="Workspace Directory">
                <Input
                  value={draft.workspaceDir}
                  onChange={(event) =>
                    updateDraft({ workspaceDir: event.target.value })
                  }
                />
              </FieldGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Log Level</Label>
                <RadioGroup
                  value={draft.preferences.logLevel}
                  onValueChange={(value) =>
                    updatePreference(
                      'logLevel',
                      value as AppConfig['preferences']['logLevel'],
                    )
                  }
                  className="grid gap-2"
                >
                  <SettingRadio value="error" label="Error only" />
                  <SettingRadio value="warn" label="Warnings" />
                  <SettingRadio value="info" label="Info" />
                  <SettingRadio value="debug" label="Debug" />
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Diagnostics</Label>
                <SwitchRow
                  label="Debug mode"
                  description="Enable extra diagnostics and verbose troubleshooting output."
                  checked={draft.preferences.debugMode}
                  onCheckedChange={(checked) =>
                    updatePreference('debugMode', checked)
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="outline" onClick={handleImport}>
                Import Configuration
              </Button>
              <Button variant="outline" onClick={handleExport}>
                Export Configuration
              </Button>
            </div>

            <div className="flex justify-end">
              <Button
                variant="destructive"
                onClick={handleReset}
                disabled={isSaving}
              >
                Reset to Defaults
              </Button>
            </div>

            {instances.length > 0 && (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="space-y-2">
                  <Label>Configuration Target Instance</Label>
                  <div className="flex flex-wrap gap-2">
                    {instances.map((instance) => (
                      <Button
                        key={instance.id}
                        variant={
                          selectedInstanceId === instance.id
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        onClick={() => setSelectedInstanceId(instance.id)}
                      >
                        {instance.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {bundleLoading && (
                  <p className="text-sm text-muted-foreground">
                    Loading instance configuration...
                  </p>
                )}

                {!bundleLoading && bundle && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>OpenClaw Configuration Editor (JSON)</Label>
                      <Textarea
                        className="min-h-[220px] font-mono text-xs"
                        value={openclawConfigText}
                        onChange={(event) =>
                          setOpenclawConfigText(event.target.value)
                        }
                      />
                      <div className="flex justify-end">
                        <Button onClick={handleSaveOpenclawConfig}>
                          Save OpenClaw Config
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Environment Variables</Label>
                      <div className="space-y-3">
                        {bundle.envVars.map((item) => (
                          <div
                            key={item.key}
                            className="rounded-md border border-border p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-mono text-xs">{item.key}</p>
                              {item.defaultValue !== undefined && (
                                <p className="text-xs text-muted-foreground">
                                  Default:{' '}
                                  <span className="font-mono">
                                    {item.defaultValue}
                                  </span>
                                </p>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {item.description}
                            </p>
                            <Input
                              value={envDraftValues[item.key] ?? ''}
                              onChange={(event) =>
                                setEnvDraftValues((current) => ({
                                  ...current,
                                  [item.key]: event.target.value,
                                }))
                              }
                            />
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResetEnvVar(item.key)}
                              >
                                Reset
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleSaveEnvVar(item.key)}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Docker Compose Base File</Label>
                      <Textarea
                        className="min-h-[180px] font-mono text-xs"
                        value={bundle.composeFile}
                        readOnly
                      />
                    </div>

                    <div className="space-y-3">
                      <Label>Docker Compose Override</Label>
                      <Textarea
                        className="min-h-[180px] font-mono text-xs"
                        value={composeOverrideText}
                        onChange={(event) =>
                          setComposeOverrideText(event.target.value)
                        }
                      />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Extra Mounts (one per line)</Label>
                        <Textarea
                          className="min-h-[120px] font-mono text-xs"
                          value={extraMountsText}
                          onChange={(event) =>
                            setExtraMountsText(event.target.value)
                          }
                          placeholder="/host/path:/container/path"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Additional Packages (one per line)</Label>
                        <Textarea
                          className="min-h-[120px] font-mono text-xs"
                          value={additionalPackagesText}
                          onChange={(event) =>
                            setAdditionalPackagesText(event.target.value)
                          }
                          placeholder="curl"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={handleSaveComposeCustomization}>
                        Save Compose Customization
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {instances.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No instances found for advanced configuration editing.
              </p>
            )}

            {restartPrompt && (
              <Alert>
                <AlertTitle>Restart Recommended</AlertTitle>
                <AlertDescription>{restartPrompt}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="outline" onClick={() => void loadConfig()}>
                Reload Configuration
              </Button>
              <Button variant="destructive" onClick={handleFactoryReset}>
                Factory Reset Workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => {
            if (config) {
              setDraft(config);
              void clearSettingsDraft();
              setMessage(null);
            }
          }}
          disabled={isLoading || isSaving || !hasChanges}
        >
          Discard Changes
        </Button>
        <Button
          onClick={handleSave}
          disabled={isLoading || isSaving || !hasChanges}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SettingRadio({ value, label }: { value: string; label: string }) {
  return (
    <label
      htmlFor={`setting-${value}`}
      className="flex items-center gap-2 rounded-md border border-border p-3 cursor-pointer"
    >
      <RadioGroupItem value={value} id={`setting-${value}`} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function CategoryButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant={isActive ? 'default' : 'outline'} onClick={onClick}>
      {label}
    </Button>
  );
}

export default SettingsPage;
