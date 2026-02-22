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
interface DependencyStatus {
  installed: boolean;
  running?: boolean;
  version?: string;
  error?: string;
}

type Platform = 'windows' | 'macos' | 'linux';

type WizardStep =
  | 'checking'
  | 'not-installed'
  | 'install-guide'
  | 'verify-install'
  | 'daemon-not-running'
  | 'check-compose'
  | 'complete';

interface DockerSetupWizardProps {
  platform: Platform;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function DockerSetupWizard({
  platform,
  onComplete,
  onCancel,
}: DockerSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Docker status
  const [dockerStatus, setDockerStatus] = useState<DependencyStatus | null>(
    null,
  );
  const [composeStatus, setComposeStatus] = useState<DependencyStatus | null>(
    null,
  );

  // Installation method for Windows
  const [windowsMethod, setWindowsMethod] = useState<'desktop' | 'wsl'>(
    'desktop',
  );

  // Check Docker Compose
  const checkCompose = useCallback(async () => {
    setLoading(true);
    try {
      const status = await invoke<DependencyStatus>('check_docker_compose');
      setComposeStatus(status);
      setStep(status.installed ? 'complete' : 'check-compose');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('check-compose');
    } finally {
      setLoading(false);
    }
  }, []);

  // Check Docker status
  const checkDocker = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const status = await invoke<DependencyStatus>('check_docker_running');
      setDockerStatus(status);

      if (!status.installed) {
        setStep('not-installed');
      } else if (!status.running) {
        setStep('daemon-not-running');
      } else {
        // Docker is installed and running, check compose
        await checkCompose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('not-installed');
    } finally {
      setLoading(false);
    }
  }, [checkCompose]);

  useEffect(() => {
    checkDocker();
  }, [checkDocker]);

  // Get step progress
  const getProgress = () => {
    const steps: WizardStep[] = [
      'checking',
      'not-installed',
      'install-guide',
      'verify-install',
      'daemon-not-running',
      'check-compose',
      'complete',
    ];
    const currentIndex = steps.indexOf(step);
    return Math.round((currentIndex / (steps.length - 1)) * 100);
  };

  // Open external link
  const openLink = (url: string) => {
    void openUrl(url).catch((err) => {
      console.error('Failed to open external link:', err);
    });
  };

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Docker Setup</CardTitle>
              <CardDescription>
                Install and configure Docker for running OpenClaw services
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
              <p className="text-muted-foreground">Checking Docker status...</p>
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
              Docker Not Installed
            </CardTitle>
            <CardDescription>
              Docker is required to run OpenClaw services. Follow the guide
              below to install it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Platform-specific guides */}
            {platform === 'windows' && (
              <WindowsDockerGuide
                method={windowsMethod}
                onMethodChange={setWindowsMethod}
                onOpenLink={openLink}
              />
            )}
            {platform === 'macos' && <MacOSDockerGuide onOpenLink={openLink} />}
            {platform === 'linux' && <LinuxDockerGuide onOpenLink={openLink} />}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => setStep('install-guide')}
                variant="outline"
              >
                View Detailed Guide
              </Button>
              <Button onClick={checkDocker} disabled={loading}>
                {loading ? <Spinner size="sm" className="mr-2" /> : null}
                Check Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Install Guide */}
      {step === 'install-guide' && (
        <Card>
          <CardHeader>
            <CardTitle>Installation Guide</CardTitle>
            <CardDescription>
              Follow these steps to install Docker on your system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {platform === 'windows' && (
              <WindowsDetailedGuide
                method={windowsMethod}
                onMethodChange={setWindowsMethod}
                onOpenLink={openLink}
              />
            )}
            {platform === 'macos' && (
              <MacOSDetailedGuide onOpenLink={openLink} />
            )}
            {platform === 'linux' && (
              <LinuxDetailedGuide onOpenLink={openLink} />
            )}

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={() => setStep('not-installed')}
              >
                Back
              </Button>
              <Button onClick={checkDocker} disabled={loading}>
                {loading ? <Spinner size="sm" className="mr-2" /> : null}
                Verify Installation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Verify Install */}
      {step === 'verify-install' && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-3">
              <Spinner size="lg" />
              <p className="text-muted-foreground">
                Verifying Docker installation...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Daemon Not Running */}
      {step === 'daemon-not-running' && dockerStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusIcon status="warning" />
              Docker Daemon Not Running
            </CardTitle>
            <CardDescription>
              Docker is installed but the daemon is not running.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-md bg-muted flex items-center justify-between">
              <div>
                <span className="font-medium">Docker</span>
                {dockerStatus.version && (
                  <Badge variant="outline" className="ml-2">
                    {dockerStatus.version}
                  </Badge>
                )}
              </div>
              <Badge variant="secondary">Installed</Badge>
            </div>

            <div className="p-4 rounded-md bg-warning/10 border border-warning/30">
              <h4 className="font-medium mb-2">Start Docker:</h4>
              {platform === 'windows' && (
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Open Docker Desktop from the Start menu</li>
                  <li>
                    Wait for Docker to finish starting (whale icon in system
                    tray)
                  </li>
                  <li>
                    If using Docker in WSL2, open your WSL terminal and run:{' '}
                    <code className="bg-background px-1 rounded">
                      sudo service docker start
                    </code>
                  </li>
                </ul>
              )}
              {platform === 'macos' && (
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Open Docker Desktop from Applications</li>
                  <li>
                    Wait for Docker to finish starting (whale icon in menu bar)
                  </li>
                </ul>
              )}
              {platform === 'linux' && (
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>
                    Run:{' '}
                    <code className="bg-background px-1 rounded">
                      sudo systemctl start docker
                    </code>
                  </li>
                  <li>
                    Or:{' '}
                    <code className="bg-background px-1 rounded">
                      sudo service docker start
                    </code>
                  </li>
                  <li>
                    To enable on boot:{' '}
                    <code className="bg-background px-1 rounded">
                      sudo systemctl enable docker
                    </code>
                  </li>
                </ul>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={checkDocker} disabled={loading}>
                {loading ? <Spinner size="sm" className="mr-2" /> : null}
                Check Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Check Compose */}
      {step === 'check-compose' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusIcon status="warning" />
              Docker Compose Check
            </CardTitle>
            <CardDescription>
              Docker Compose v2 is required for managing OpenClaw services.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Docker Status */}
            <div className="p-3 rounded-md bg-muted flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon status="success" />
                <span className="font-medium">Docker</span>
                {dockerStatus?.version && (
                  <Badge variant="outline">{dockerStatus.version}</Badge>
                )}
              </div>
              <Badge variant="default">Running</Badge>
            </div>

            {/* Compose Status */}
            <div className="p-3 rounded-md bg-muted flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon
                  status={composeStatus?.installed ? 'success' : 'error'}
                />
                <span className="font-medium">Docker Compose</span>
                {composeStatus?.version && (
                  <Badge variant="outline">{composeStatus.version}</Badge>
                )}
              </div>
              <Badge
                variant={composeStatus?.installed ? 'default' : 'destructive'}
              >
                {composeStatus?.installed ? 'Available' : 'Missing'}
              </Badge>
            </div>

            {!composeStatus?.installed && (
              <div className="p-4 rounded-md bg-destructive/10 border border-destructive/30">
                <h4 className="font-medium mb-2">Install Docker Compose:</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Docker Compose v2 comes bundled with Docker Desktop. If you're
                  using Docker Engine on Linux, install the compose plugin:
                </p>
                <code className="block p-2 bg-background rounded text-xs font-mono">
                  sudo apt-get install docker-compose-plugin
                </code>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={checkCompose} disabled={loading}>
                {loading ? <Spinner size="sm" className="mr-2" /> : null}
                Check Again
              </Button>
              {composeStatus?.installed && (
                <Button onClick={() => setStep('complete')}>Continue</Button>
              )}
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
              Docker Ready
            </CardTitle>
            <CardDescription>
              Docker is installed and running correctly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Docker Status */}
            <div className="p-3 rounded-md bg-success/10 border border-success/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon status="success" />
                <span className="font-medium">Docker</span>
                {dockerStatus?.version && (
                  <Badge variant="outline">{dockerStatus.version}</Badge>
                )}
              </div>
              <Badge variant="default">Running</Badge>
            </div>

            {/* Compose Status */}
            <div className="p-3 rounded-md bg-success/10 border border-success/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon status="success" />
                <span className="font-medium">Docker Compose</span>
                {composeStatus?.version && (
                  <Badge variant="outline">{composeStatus.version}</Badge>
                )}
              </div>
              <Badge variant="default">Available</Badge>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={onComplete}>Continue to Next Step</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Platform-specific guide components

function WindowsDockerGuide({
  method,
  onMethodChange,
  onOpenLink,
}: {
  method: 'desktop' | 'wsl';
  onMethodChange: (method: 'desktop' | 'wsl') => void;
  onOpenLink: (url: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={method === 'desktop' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onMethodChange('desktop')}
        >
          Docker Desktop (Recommended)
        </Button>
        <Button
          variant={method === 'wsl' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onMethodChange('wsl')}
        >
          Docker in WSL2 (Advanced)
        </Button>
      </div>

      {method === 'desktop' ? (
        <div className="p-4 rounded-md bg-muted">
          <h4 className="font-medium mb-2">Install Docker Desktop:</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Download Docker Desktop from docker.com</li>
            <li>Run the installer</li>
            <li>Enable "Use WSL 2 based engine" during installation</li>
            <li>Restart your computer if prompted</li>
            <li>Launch Docker Desktop and wait for it to start</li>
          </ol>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              onOpenLink('https://www.docker.com/products/docker-desktop/')
            }
          >
            Download Docker Desktop
          </Button>
        </div>
      ) : (
        <div className="p-4 rounded-md bg-muted">
          <h4 className="font-medium mb-2">Install Docker in WSL2:</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Open your WSL2 terminal and run these commands:
          </p>
          <div className="space-y-2">
            <code className="block p-2 bg-background rounded text-xs font-mono">
              sudo apt-get update
            </code>
            <code className="block p-2 bg-background rounded text-xs font-mono">
              sudo apt-get install docker.io docker-compose-plugin
            </code>
            <code className="block p-2 bg-background rounded text-xs font-mono">
              sudo usermod -aG docker $USER
            </code>
            <code className="block p-2 bg-background rounded text-xs font-mono">
              sudo service docker start
            </code>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Log out and back in for group changes to take effect.
          </p>
        </div>
      )}
    </div>
  );
}

function MacOSDockerGuide({
  onOpenLink,
}: {
  onOpenLink: (url: string) => void;
}) {
  return (
    <div className="p-4 rounded-md bg-muted">
      <h4 className="font-medium mb-2">Install Docker Desktop for Mac:</h4>
      <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
        <li>Download Docker Desktop from docker.com</li>
        <li>Open the .dmg file</li>
        <li>Drag Docker to Applications</li>
        <li>Launch Docker from Applications</li>
        <li>Grant permissions when prompted</li>
        <li>Wait for Docker to finish starting (whale icon in menu bar)</li>
      </ol>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() =>
          onOpenLink('https://www.docker.com/products/docker-desktop/')
        }
      >
        Download Docker Desktop
      </Button>
    </div>
  );
}

function LinuxDockerGuide({
  onOpenLink,
}: {
  onOpenLink: (url: string) => void;
}) {
  return (
    <div className="p-4 rounded-md bg-muted">
      <h4 className="font-medium mb-2">Install Docker Engine:</h4>
      <p className="text-sm text-muted-foreground mb-2">
        For Ubuntu/Debian, run these commands:
      </p>
      <div className="space-y-2">
        <code className="block p-2 bg-background rounded text-xs font-mono">
          sudo apt-get update
        </code>
        <code className="block p-2 bg-background rounded text-xs font-mono">
          sudo apt-get install docker.io docker-compose-plugin
        </code>
        <code className="block p-2 bg-background rounded text-xs font-mono">
          sudo usermod -aG docker $USER
        </code>
        <code className="block p-2 bg-background rounded text-xs font-mono">
          sudo systemctl enable --now docker
        </code>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Log out and back in for group changes to take effect.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => onOpenLink('https://docs.docker.com/engine/install/')}
      >
        View Full Documentation
      </Button>
    </div>
  );
}

// Detailed guides with more steps

function WindowsDetailedGuide({
  method,
  onMethodChange,
  onOpenLink,
}: {
  method: 'desktop' | 'wsl';
  onMethodChange: (method: 'desktop' | 'wsl') => void;
  onOpenLink: (url: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <Button
          variant={method === 'desktop' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onMethodChange('desktop')}
        >
          Docker Desktop
        </Button>
        <Button
          variant={method === 'wsl' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onMethodChange('wsl')}
        >
          Docker in WSL2
        </Button>
      </div>

      {method === 'desktop' ? (
        <div className="space-y-4">
          <StepCard
            number={1}
            title="Download Docker Desktop"
            description="Visit the Docker website and download the installer for Windows."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onOpenLink('https://www.docker.com/products/docker-desktop/')
              }
            >
              Open Download Page
            </Button>
          </StepCard>

          <StepCard
            number={2}
            title="Run the Installer"
            description="Double-click the downloaded file and follow the installation wizard."
          >
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Accept the license agreement</li>
              <li>Ensure "Use WSL 2 based engine" is checked</li>
              <li>Click Install</li>
            </ul>
          </StepCard>

          <StepCard
            number={3}
            title="Configure WSL 2 Integration"
            description="After installation, configure Docker to use your WSL distributions."
          >
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Open Docker Desktop Settings</li>
              <li>Go to Resources → WSL Integration</li>
              <li>Enable integration with your WSL distribution</li>
            </ul>
          </StepCard>

          <StepCard
            number={4}
            title="Start Docker Desktop"
            description="Launch Docker Desktop and wait for it to fully start."
          >
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Look for the whale icon in your system tray</li>
              <li>Wait until it shows "Docker Desktop is running"</li>
              <li>This may take a minute on first start</li>
            </ul>
          </StepCard>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Advanced Option</AlertTitle>
            <AlertDescription>
              Installing Docker directly in WSL2 requires more manual
              configuration but uses fewer system resources than Docker Desktop.
            </AlertDescription>
          </Alert>

          <StepCard
            number={1}
            title="Open WSL Terminal"
            description="Open your WSL distribution (e.g., Ubuntu) from the Start menu."
          />

          <StepCard
            number={2}
            title="Update Package List"
            description="Update your package manager's list of available packages."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo apt-get update
            </code>
          </StepCard>

          <StepCard
            number={3}
            title="Install Docker"
            description="Install Docker and the Compose plugin."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo apt-get install -y docker.io docker-compose-plugin
            </code>
          </StepCard>

          <StepCard
            number={4}
            title="Add User to Docker Group"
            description="Allow your user to run Docker commands without sudo."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo usermod -aG docker $USER
            </code>
            <p className="text-xs text-muted-foreground mt-1">
              You'll need to log out and back in for this to take effect.
            </p>
          </StepCard>

          <StepCard
            number={5}
            title="Start Docker Service"
            description="Start the Docker daemon."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo service docker start
            </code>
          </StepCard>
        </div>
      )}
    </div>
  );
}

function MacOSDetailedGuide({
  onOpenLink,
}: {
  onOpenLink: (url: string) => void;
}) {
  return (
    <div className="space-y-4">
      <StepCard
        number={1}
        title="Download Docker Desktop"
        description="Visit the Docker website and download Docker Desktop for Mac."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onOpenLink('https://www.docker.com/products/docker-desktop/')
          }
        >
          Open Download Page
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Choose the version for your Mac's chip (Apple Silicon or Intel).
        </p>
      </StepCard>

      <StepCard
        number={2}
        title="Install Docker Desktop"
        description="Open the downloaded .dmg file and drag Docker to Applications."
      >
        <ul className="list-disc list-inside text-sm text-muted-foreground">
          <li>Double-click the downloaded .dmg file</li>
          <li>Drag the Docker icon to the Applications folder</li>
          <li>Wait for the copy to complete</li>
        </ul>
      </StepCard>

      <StepCard
        number={3}
        title="Launch Docker Desktop"
        description="Open Docker Desktop from your Applications folder."
      >
        <ul className="list-disc list-inside text-sm text-muted-foreground">
          <li>Open Finder → Applications → Docker</li>
          <li>Click "Open" if you see a security warning</li>
          <li>Grant permissions when prompted (network, files)</li>
        </ul>
      </StepCard>

      <StepCard
        number={4}
        title="Complete Setup"
        description="Wait for Docker Desktop to finish starting."
      >
        <ul className="list-disc list-inside text-sm text-muted-foreground">
          <li>Look for the whale icon in your menu bar</li>
          <li>Wait until it stops animating</li>
          <li>Click the icon to see "Docker Desktop is running"</li>
        </ul>
      </StepCard>
    </div>
  );
}

function LinuxDetailedGuide({
  onOpenLink,
}: {
  onOpenLink: (url: string) => void;
}) {
  const [distro, setDistro] = useState<'ubuntu' | 'fedora' | 'arch'>('ubuntu');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <Button
          variant={distro === 'ubuntu' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDistro('ubuntu')}
        >
          Ubuntu/Debian
        </Button>
        <Button
          variant={distro === 'fedora' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDistro('fedora')}
        >
          Fedora
        </Button>
        <Button
          variant={distro === 'arch' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDistro('arch')}
        >
          Arch
        </Button>
      </div>

      {distro === 'ubuntu' && (
        <>
          <StepCard
            number={1}
            title="Update Package List"
            description="Update your package manager."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo apt-get update
            </code>
          </StepCard>

          <StepCard
            number={2}
            title="Install Docker"
            description="Install Docker Engine and Compose plugin."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo apt-get install -y docker.io docker-compose-plugin
            </code>
          </StepCard>

          <StepCard
            number={3}
            title="Add User to Docker Group"
            description="Allow running Docker without sudo."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo usermod -aG docker $USER
            </code>
          </StepCard>

          <StepCard
            number={4}
            title="Enable and Start Docker"
            description="Start Docker and enable it on boot."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo systemctl enable --now docker
            </code>
          </StepCard>
        </>
      )}

      {distro === 'fedora' && (
        <>
          <StepCard
            number={1}
            title="Install Docker"
            description="Install Docker Engine using dnf."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo dnf install docker docker-compose-plugin
            </code>
          </StepCard>

          <StepCard
            number={2}
            title="Add User to Docker Group"
            description="Allow running Docker without sudo."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo usermod -aG docker $USER
            </code>
          </StepCard>

          <StepCard
            number={3}
            title="Enable and Start Docker"
            description="Start Docker and enable it on boot."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo systemctl enable --now docker
            </code>
          </StepCard>
        </>
      )}

      {distro === 'arch' && (
        <>
          <StepCard
            number={1}
            title="Install Docker"
            description="Install Docker using pacman."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo pacman -S docker docker-compose
            </code>
          </StepCard>

          <StepCard
            number={2}
            title="Add User to Docker Group"
            description="Allow running Docker without sudo."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo usermod -aG docker $USER
            </code>
          </StepCard>

          <StepCard
            number={3}
            title="Enable and Start Docker"
            description="Start Docker and enable it on boot."
          >
            <code className="block p-2 bg-muted rounded text-xs font-mono mt-2">
              sudo systemctl enable --now docker
            </code>
          </StepCard>
        </>
      )}

      <Alert>
        <AlertDescription>
          After adding your user to the docker group, log out and log back in
          for the changes to take effect.
        </AlertDescription>
      </Alert>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onOpenLink('https://docs.docker.com/engine/install/')}
      >
        View Official Documentation
      </Button>
    </div>
  );
}

// Helper components

function StepCard({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-md border">
      <div className="flex items-start gap-3">
        <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
          {number}
        </div>
        <div className="flex-1">
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

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

export default DockerSetupWizard;
