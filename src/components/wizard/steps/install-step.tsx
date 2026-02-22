import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Progress,
  Spinner,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { useConfigStore, useWizardStore } from '@/stores';

interface InstallEvent {
  step: string;
  progress: number;
  message: string;
  isError?: boolean;
  details?: string;
}

export function InstallStep() {
  const {
    data,
    installProgress,
    installCurrentTask,
    installLog,
    installError,
    startInstall,
    setInstallProgress,
    addInstallLog,
    setInstallError,
    completeInstall,
  } = useWizardStore();
  const { platform } = useConfigStore();

  const [showLogs, setShowLogs] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current && showLogs) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [showLogs]);

  // Start installation on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const runInstallation = async () => {
      startInstall();

      // Listen for install events
      const unlisten = await listen<InstallEvent>(
        'install-progress',
        (event) => {
          const { step, progress, message, isError, details } = event.payload;

          // Add to log with optional details
          const logMessage = details
            ? `[${step}] ${message}\n    ${details}`
            : `[${step}] ${message}`;
          addInstallLog(logMessage);
          setInstallProgress(progress, step);

          if (isError) {
            const errorMsg = details ? `${message}: ${details}` : message;
            setInstallError(errorMsg);
          }
        },
      );

      try {
        // Build the installation config
        const installConfig = {
          clawpitDir: data.clawpitDir,
          instance: {
            id: data.instance.id,
            name: data.instance.name,
            description: data.instance.description,
            gatewayPort: data.instance.gatewayPort,
            bridgePort: data.instance.bridgePort,
            bindMode: data.instance.bindMode,
            authToken: data.instance.authToken,
            tokenGenerated: data.instance.tokenGenerated,
            providers: data.instance.providers,
          },
          platform,
          wslDistro: data.wslDistro,
          // Set to true to skip Docker operations (for development/testing)
          skipDocker: false,
          // Enable OpenAI model by default (user can configure after install)
          openaiEnabled: true,
        };

        // Run installation
        await invoke('run_installation', { config: installConfig });

        // Installation complete
        completeInstall();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setInstallError(errorMessage);
        addInstallLog(`[ERROR] ${errorMessage}`);
      } finally {
        unlisten();
      }
    };

    runInstallation();
  }, [
    data,
    platform,
    startInstall,
    setInstallProgress,
    addInstallLog,
    setInstallError,
    completeInstall,
  ]);

  // Retry installation
  const handleRetry = () => {
    hasStarted.current = false;
    useWizardStore.getState().setStep('review');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold">
          {installError
            ? 'Installation Failed'
            : installProgress === 100
              ? 'Installation Complete'
              : 'Installing OpenClaw'}
        </h2>
        <p className="text-muted-foreground mt-1">
          {installError
            ? 'An error occurred during installation'
            : installProgress === 100
              ? 'Your instance is ready to use'
              : 'Please wait while we set up your instance'}
        </p>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {installCurrentTask || 'Initializing...'}
              </span>
              <span className="font-medium">{installProgress}%</span>
            </div>
            <Progress
              value={installProgress}
              className={cn('h-3', installError && 'bg-destructive/20')}
            />
          </div>

          {/* Status Indicator */}
          <div className="flex items-center justify-center py-4">
            {installError ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <span className="text-3xl">❌</span>
                </div>
                <span className="text-sm font-medium text-destructive">
                  Error
                </span>
              </div>
            ) : installProgress === 100 ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                  <span className="text-3xl">✅</span>
                </div>
                <span className="text-sm font-medium text-success">
                  Complete
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Spinner size="lg" />
                </div>
                <span className="text-sm font-medium text-primary">
                  Installing
                </span>
              </div>
            )}
          </div>

          {/* Installation Steps */}
          <div className="space-y-2">
            <InstallStepIndicator
              step="Creating directories"
              status={getStepStatus(installProgress, 0, 10)}
            />
            <InstallStepIndicator
              step="Generating configuration"
              status={getStepStatus(installProgress, 10, 30)}
            />
            <InstallStepIndicator
              step="Pulling Docker image"
              status={getStepStatus(installProgress, 30, 45)}
            />
            <InstallStepIndicator
              step="Running OpenClaw setup"
              status={getStepStatus(installProgress, 45, 60)}
            />
            <InstallStepIndicator
              step="Configuring OpenClaw"
              status={getStepStatus(installProgress, 60, 72)}
            />
            <InstallStepIndicator
              step="Validating configuration"
              status={getStepStatus(installProgress, 72, 80)}
            />
            <InstallStepIndicator
              step="Starting gateway"
              status={getStepStatus(installProgress, 80, 92)}
            />
            <InstallStepIndicator
              step="Verifying installation"
              status={getStepStatus(installProgress, 92, 100)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {installError && (
        <Alert variant="destructive">
          <AlertTitle>Installation Error</AlertTitle>
          <AlertDescription className="mt-2">
            <p>{installError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={handleRetry}
            >
              Go Back and Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Log Viewer Toggle */}
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLogs(!showLogs)}
        >
          {showLogs ? 'Hide' : 'Show'} Installation Logs
        </Button>
      </div>

      {/* Log Viewer */}
      {showLogs && (
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div
              ref={logRef}
              className="h-48 overflow-y-auto font-mono text-xs space-y-1"
            >
              {installLog.length === 0 ? (
                <p className="text-muted-foreground">No logs yet...</p>
              ) : (
                installLog.map((log) => (
                  <pre
                    key={log}
                    className={cn(
                      'whitespace-pre-wrap break-words',
                      log.includes('[ERROR]') || log.includes('Error')
                        ? 'text-destructive'
                        : log.includes('warning') || log.includes('Warning')
                          ? 'text-yellow-500'
                          : 'text-muted-foreground',
                    )}
                  >
                    {log}
                  </pre>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Actions */}
      {installProgress === 100 && !installError && (
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Click <strong>Next</strong> to configure AI models.
          </p>
        </div>
      )}
    </div>
  );
}

function getStepStatus(
  progress: number,
  start: number,
  end: number,
): 'pending' | 'active' | 'complete' {
  if (progress >= end) return 'complete';
  if (progress >= start) return 'active';
  return 'pending';
}

function InstallStepIndicator({
  step,
  status,
}: {
  step: string;
  status: 'pending' | 'active' | 'complete';
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'w-5 h-5 rounded-full flex items-center justify-center transition-colors',
          status === 'complete' && 'bg-success text-success-foreground',
          status === 'active' && 'bg-primary text-primary-foreground',
          status === 'pending' && 'bg-muted text-muted-foreground',
        )}
      >
        {status === 'complete' ? (
          <CheckIcon className="w-3 h-3" />
        ) : status === 'active' ? (
          <Spinner size="sm" className="w-3 h-3" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-current" />
        )}
      </div>
      <span
        className={cn(
          'text-sm',
          status === 'complete' && 'text-success',
          status === 'active' && 'text-foreground font-medium',
          status === 'pending' && 'text-muted-foreground',
        )}
      >
        {step}
      </span>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default InstallStep;
