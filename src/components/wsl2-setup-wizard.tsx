import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Spinner,
} from '@/components/ui';
import { cn } from '@/lib/utils';

// Types
interface WslDistro {
  name: string;
  isDefault: boolean;
  wslVersion: number;
  state: string;
}

interface WslStatus {
  installed: boolean;
  isWsl2: boolean;
  distributions: WslDistro[];
  defaultDistro?: string;
  error?: string;
}

interface WslVersionInfo {
  wslVersion?: string;
  kernelVersion?: string;
  wslgVersion?: string;
  defaultVersion: number;
}

interface WslDistroValidation {
  distroName: string;
  dockerAvailable: boolean;
  dockerVersion?: string;
  errors: string[];
}

type WizardStep =
  | 'checking'
  | 'not-installed'
  | 'install-distro'
  | 'select-distro'
  | 'validate-distro'
  | 'configure'
  | 'complete';

interface WSL2SetupWizardProps {
  onComplete?: (selectedDistro: string) => void;
  onCancel?: () => void;
}

export function WSL2SetupWizard({
  onComplete,
  onCancel,
}: WSL2SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WSL State
  const [wslStatus, setWslStatus] = useState<WslStatus | null>(null);
  const [wslVersionInfo, setWslVersionInfo] = useState<WslVersionInfo | null>(
    null,
  );
  const [selectedDistro, setSelectedDistro] = useState<string | null>(null);
  const [validation, setValidation] = useState<WslDistroValidation | null>(
    null,
  );

  // Check WSL status on mount
  const checkWslStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const status = await invoke<WslStatus>('get_wsl_status');
      setWslStatus(status);

      if (!status.installed) {
        setStep('not-installed');
      } else if (status.distributions.length === 0) {
        setStep('install-distro');
      } else {
        // Auto-select default distro if available
        if (status.defaultDistro) {
          setSelectedDistro(status.defaultDistro);
        }
        setStep('select-distro');

        // Also get version info
        try {
          const versionInfo = await invoke<WslVersionInfo>(
            'get_wsl_version_info',
          );
          setWslVersionInfo(versionInfo);
        } catch {
          // Version info is optional
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('not-installed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkWslStatus();
  }, [checkWslStatus]);

  // Validate selected distribution
  const validateDistro = async (distroName: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await invoke<WslDistroValidation>(
        'validate_wsl_distro_tools',
        {
          name: distroName,
        },
      );
      setValidation(result);
      setStep('validate-distro');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Set selected distro as default
  const setAsDefault = async () => {
    if (!selectedDistro) return;

    setLoading(true);
    setError(null);

    try {
      await invoke('set_default_wsl_distro', { name: selectedDistro });
      await invoke('set_wsl_distro', { distro: selectedDistro });
      await checkWslStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Convert distro to WSL2
  const convertToWsl2 = async (distroName: string) => {
    setLoading(true);
    setError(null);

    try {
      await invoke('convert_distro_to_wsl2', { name: distroName });
      await checkWslStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Start a distro
  const startDistro = async (distroName: string) => {
    setLoading(true);
    setError(null);

    try {
      await invoke('start_wsl_distro', { name: distroName });
      await checkWslStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Complete the wizard
  const handleComplete = () => {
    if (selectedDistro && onComplete) {
      onComplete(selectedDistro);
    }
  };

  const openExternal = (url: string) => {
    void openUrl(url).catch((error) => {
      console.error('Failed to open external link:', error);
    });
  };

  // Get step progress
  const getProgress = () => {
    const steps: WizardStep[] = [
      'checking',
      'not-installed',
      'install-distro',
      'select-distro',
      'validate-distro',
      'configure',
      'complete',
    ];
    const currentIndex = steps.indexOf(step);
    return Math.round((currentIndex / (steps.length - 1)) * 100);
  };

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>WSL2 Setup</CardTitle>
              <CardDescription>
                Configure Windows Subsystem for Linux 2 for running Docker
              </CardDescription>
            </div>
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={getProgress()} className="h-2" />
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step: Checking */}
      {step === 'checking' && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-3">
              <Spinner size="lg" />
              <p className="text-muted-foreground">Checking WSL status...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Not Installed */}
      {step === 'not-installed' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusIcon status="error" />
              WSL2 Not Installed
            </CardTitle>
            <CardDescription>
              Windows Subsystem for Linux 2 is required for running Docker
              commands on Windows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-md bg-muted">
              <h4 className="font-medium mb-3">Installation Steps:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Open PowerShell as Administrator</li>
                <li>
                  Run the following command:
                  <code className="block mt-1 p-2 bg-background rounded text-xs font-mono">
                    wsl --install
                  </code>
                </li>
                <li>Restart your computer when prompted</li>
                <li>
                  After restart, Ubuntu will automatically begin installing
                </li>
                <li>Create a username and password when prompted</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={checkWslStatus}
                disabled={loading}
              >
                {loading ? <Spinner size="sm" className="mr-2" /> : null}
                Recheck Status
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  openExternal(
                    'https://learn.microsoft.com/en-us/windows/wsl/install',
                  );
                }}
              >
                View Documentation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Install Distribution */}
      {step === 'install-distro' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusIcon status="warning" />
              No Linux Distribution Installed
            </CardTitle>
            <CardDescription>
              WSL2 is installed, but you need a Linux distribution to run
              commands.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-md bg-muted">
              <h4 className="font-medium mb-3">
                Install Ubuntu (Recommended):
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Open Microsoft Store</li>
                <li>Search for "Ubuntu"</li>
                <li>Install "Ubuntu" (or "Ubuntu 22.04 LTS")</li>
                <li>Launch Ubuntu from the Start menu</li>
                <li>Create a username and password when prompted</li>
              </ol>

              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Or install via PowerShell:
                </p>
                <code className="block p-2 bg-background rounded text-xs font-mono">
                  wsl --install -d Ubuntu
                </code>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={checkWslStatus}
                disabled={loading}
              >
                {loading ? <Spinner size="sm" className="mr-2" /> : null}
                Recheck Status
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  openExternal('ms-windows-store://search/?query=Ubuntu');
                }}
              >
                Open Microsoft Store
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Select Distribution */}
      {step === 'select-distro' && wslStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusIcon status="success" />
              Select WSL Distribution
            </CardTitle>
            <CardDescription>
              Choose which Linux distribution to use for Docker commands.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Version Info */}
            {wslVersionInfo && (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {wslVersionInfo.wslVersion && (
                  <Badge variant="outline">
                    WSL {wslVersionInfo.wslVersion}
                  </Badge>
                )}
                {wslVersionInfo.kernelVersion && (
                  <Badge variant="outline">
                    Kernel {wslVersionInfo.kernelVersion}
                  </Badge>
                )}
              </div>
            )}

            {/* Distribution List */}
            <div className="space-y-2">
              {wslStatus.distributions.map((distro) => (
                <button
                  type="button"
                  key={distro.name}
                  className={cn(
                    'p-3 rounded-md border cursor-pointer transition-colors text-left w-full',
                    selectedDistro === distro.name
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                  )}
                  onClick={() => setSelectedDistro(distro.name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'h-3 w-3 rounded-full border-2',
                          selectedDistro === distro.name
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground',
                        )}
                      />
                      <span className="font-medium">{distro.name}</span>
                      {distro.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          default
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          distro.wslVersion === 2 ? 'default' : 'destructive'
                        }
                        className="text-xs"
                      >
                        WSL{distro.wslVersion}
                      </Badge>
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          distro.state.toLowerCase() === 'running'
                            ? 'bg-success'
                            : 'bg-muted-foreground',
                        )}
                      />
                      <span className="text-xs text-muted-foreground">
                        {distro.state}
                      </span>
                    </div>
                  </div>

                  {/* WSL1 Warning */}
                  {distro.wslVersion === 1 &&
                    selectedDistro === distro.name && (
                      <div className="mt-2 p-2 rounded bg-warning/10 text-warning text-sm">
                        This distribution is using WSL1. It will be converted to
                        WSL2 for better Docker compatibility.
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            convertToWsl2(distro.name);
                          }}
                          disabled={loading}
                        >
                          {loading ? (
                            <Spinner size="sm" className="mr-2" />
                          ) : null}
                          Convert to WSL2
                        </Button>
                      </div>
                    )}

                  {/* Stopped Warning */}
                  {distro.state.toLowerCase() !== 'running' &&
                    selectedDistro === distro.name && (
                      <div className="mt-2 p-2 rounded bg-muted text-muted-foreground text-sm">
                        This distribution is not running.
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 ml-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            startDistro(distro.name);
                          }}
                          disabled={loading}
                        >
                          {loading ? (
                            <Spinner size="sm" className="mr-2" />
                          ) : null}
                          Start
                        </Button>
                      </div>
                    )}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={checkWslStatus}
                disabled={loading}
              >
                Refresh
              </Button>
              <div className="flex gap-2">
                {selectedDistro &&
                  !wslStatus.distributions.find(
                    (d) => d.name === selectedDistro,
                  )?.isDefault && (
                    <Button
                      variant="outline"
                      onClick={setAsDefault}
                      disabled={loading}
                    >
                      Set as Default
                    </Button>
                  )}
                <Button
                  onClick={() =>
                    selectedDistro && validateDistro(selectedDistro)
                  }
                  disabled={!selectedDistro || loading}
                >
                  {loading ? <Spinner size="sm" className="mr-2" /> : null}
                  Continue
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Validate Distribution */}
      {step === 'validate-distro' && validation && (
        <Card>
          <CardHeader>
            <CardTitle>Validating {validation.distroName}</CardTitle>
            <CardDescription>
              Checking if required tools are available in this distribution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Docker Check */}
            <div className="flex items-center justify-between p-3 rounded-md bg-muted">
              <div className="flex items-center gap-2">
                <StatusIcon
                  status={validation.dockerAvailable ? 'success' : 'error'}
                />
                <span className="font-medium">Docker</span>
              </div>
              {validation.dockerAvailable ? (
                <Badge variant="outline">{validation.dockerVersion}</Badge>
              ) : (
                <span className="text-sm text-destructive">Not installed</span>
              )}
            </div>

            {/* Errors */}
            {validation.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Missing Requirements</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {validation.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Installation Help */}
            {!validation.dockerAvailable && (
              <div className="p-4 rounded-md bg-muted">
                <h4 className="font-medium mb-2">Install Missing Tools:</h4>
                <div className="text-sm text-muted-foreground">
                  <p className="mb-1">
                    For Docker, we recommend installing Docker Desktop:
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      openExternal(
                        'https://www.docker.com/products/docker-desktop/',
                      );
                    }}
                  >
                    Download Docker Desktop
                  </Button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={() => setStep('select-distro')}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    selectedDistro && validateDistro(selectedDistro)
                  }
                  disabled={loading}
                >
                  Recheck
                </Button>
                <Button
                  onClick={() => setStep('complete')}
                  disabled={!validation.dockerAvailable}
                >
                  Continue
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Complete */}
      {step === 'complete' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusIcon status="success" />
              WSL2 Configuration Complete
            </CardTitle>
            <CardDescription>
              Your Windows Subsystem for Linux is configured and ready to use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-md bg-success/10 border border-success/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium">Selected Distribution:</span>
                <Badge>{selectedDistro}</Badge>
              </div>
              {validation && (
                <div className="text-sm text-muted-foreground">
                  <div>Docker: {validation.dockerVersion}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleComplete}>Continue to Next Step</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper component
function StatusIcon({
  status,
  className,
}: {
  status: 'success' | 'warning' | 'error';
  className?: string;
}) {
  const baseClass = 'h-5 w-5 flex-shrink-0';

  if (status === 'success') {
    return (
      <svg
        aria-hidden="true"
        className={cn(baseClass, 'text-success', className)}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }

  if (status === 'warning') {
    return (
      <svg
        aria-hidden="true"
        className={cn(baseClass, 'text-warning', className)}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={cn(baseClass, 'text-destructive', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default WSL2SetupWizard;
