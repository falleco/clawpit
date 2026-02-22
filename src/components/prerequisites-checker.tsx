import { useEffect, useState } from 'react';
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
import { PrerequisiteError, useStatusStore } from '@/stores';

interface PrerequisitesCheckerProps {
  onAllPassed?: () => void;
  showHeader?: boolean;
  onOpenWslWizard?: () => void;
  onOpenDockerWizard?: () => void;
  onOpenInstallationGuide?: () => void;
}

export function PrerequisitesChecker({
  onAllPassed,
  showHeader = true,
  onOpenWslWizard,
  onOpenDockerWizard,
  onOpenInstallationGuide,
}: PrerequisitesCheckerProps) {
  const { prerequisites, prerequisitesLoading, checkPrerequisites } =
    useStatusStore();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    // Auto-check on mount
    checkPrerequisites();
  }, [checkPrerequisites]);

  useEffect(() => {
    if (prerequisites?.allPassed && onAllPassed) {
      onAllPassed();
    }
  }, [prerequisites?.allPassed, onAllPassed]);

  const handleRetry = async () => {
    await checkPrerequisites();
  };

  const getOverallProgress = () => {
    if (!prerequisites) return 0;
    let passed = 0;
    let total = 5; // Docker, Docker Compose, Git, Network, Disk Space

    if (prerequisites.docker.installed && prerequisites.docker.running)
      passed++;
    if (prerequisites.dockerCompose.installed) passed++;
    if (prerequisites.git.installed) passed++;
    if (prerequisites.network.reachable) passed++;
    if (prerequisites.diskSpace.sufficient) passed++;

    // Add WSL for Windows
    if (prerequisites.wslStatus) {
      total++;
      if (
        prerequisites.wslStatus.installed &&
        prerequisites.wslStatus.isWsl2 &&
        prerequisites.wslStatus.distributions.length > 0
      ) {
        passed++;
      }
    }

    return Math.round((passed / total) * 100);
  };

  return (
    <div className="space-y-4">
      {showHeader && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>System Requirements</CardTitle>
                <CardDescription>
                  Checking prerequisites for OpenClaw installation
                </CardDescription>
              </div>
              <Button
                onClick={handleRetry}
                variant="outline"
                size="sm"
                disabled={prerequisitesLoading}
              >
                {prerequisitesLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Checking...
                  </>
                ) : (
                  'Recheck'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {prerequisites && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Overall Progress</span>
                  <span
                    className={cn(
                      'font-medium',
                      prerequisites.allPassed
                        ? 'text-success'
                        : 'text-muted-foreground',
                    )}
                  >
                    {getOverallProgress()}%
                  </span>
                </div>
                <Progress value={getOverallProgress()} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {prerequisitesLoading && !prerequisites && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-muted-foreground">
                Checking system requirements...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {prerequisites && (
        <>
          {/* WSL Status (Windows only) */}
          {prerequisites.wslStatus && (
            <RequirementCard
              title="WSL2"
              description="Windows Subsystem for Linux 2"
              status={getWslStatus(prerequisites.wslStatus)}
              details={
                <WslDetails
                  wslStatus={prerequisites.wslStatus}
                  expanded={expandedSection === 'wsl'}
                  onToggle={() =>
                    setExpandedSection(expandedSection === 'wsl' ? null : 'wsl')
                  }
                />
              }
              installGuide={
                !prerequisites.wslStatus.installed ||
                !prerequisites.wslStatus.isWsl2
                  ? {
                      title: 'Install WSL2',
                      steps: [
                        'Open PowerShell as Administrator',
                        'Run: wsl --install',
                        'Restart your computer',
                        'Open Ubuntu from Start menu to complete setup',
                      ],
                      link: 'https://learn.microsoft.com/en-us/windows/wsl/install',
                    }
                  : undefined
              }
              actionButton={
                onOpenWslWizard && (
                  <Button size="sm" variant="outline" onClick={onOpenWslWizard}>
                    Configure WSL2
                  </Button>
                )
              }
            />
          )}

          {/* Docker Status */}
          <RequirementCard
            title="Docker"
            description="Container runtime for running OpenClaw services"
            status={getDockerStatus(prerequisites.docker)}
            version={prerequisites.docker.version}
            details={
              <DockerDetails
                docker={prerequisites.docker}
                platform={prerequisites.platform}
              />
            }
            installGuide={
              !prerequisites.docker.installed
                ? getDockerInstallGuide(prerequisites.platform)
                : undefined
            }
            actionButton={
              onOpenDockerWizard && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenDockerWizard}
                >
                  {prerequisites.docker.installed
                    ? 'Configure'
                    : 'Setup Docker'}
                </Button>
              )
            }
          />

          {/* Docker Compose Status */}
          <RequirementCard
            title="Docker Compose"
            description="Tool for defining multi-container applications"
            status={prerequisites.dockerCompose.installed ? 'success' : 'error'}
            version={prerequisites.dockerCompose.version}
            details={
              <p className="text-sm text-muted-foreground">
                Docker Compose v2 is required for managing OpenClaw services.
                {prerequisites.dockerCompose.installed
                  ? ' Compose is available as a Docker plugin.'
                  : ' Compose comes bundled with Docker Desktop.'}
              </p>
            }
          />

          {/* Git Status */}
          <RequirementCard
            title="Git"
            description="Version control required for workspace operations"
            status={prerequisites.git.installed ? 'success' : 'error'}
            version={prerequisites.git.version}
            details={
              <p className="text-sm text-muted-foreground">
                {prerequisites.git.installed
                  ? 'Git is installed and available.'
                  : 'Git is required to clone and update OpenClaw workspaces.'}
              </p>
            }
            installGuide={
              prerequisites.git.installed
                ? undefined
                : getGitInstallGuide(prerequisites.platform)
            }
          />

          {/* Network Connectivity */}
          <RequirementCard
            title="Network Connectivity"
            description="Internet access for pulling images and updates"
            status={prerequisites.network.reachable ? 'success' : 'warning'}
            version={
              prerequisites.network.reachable
                ? prerequisites.network.latencyMs
                  ? `${prerequisites.network.latencyMs} ms`
                  : 'Reachable'
                : 'Unreachable'
            }
            details={
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Endpoint: {prerequisites.network.endpoint}</p>
                {prerequisites.network.error && (
                  <p className="text-warning">{prerequisites.network.error}</p>
                )}
              </div>
            }
          />

          {/* Disk Space */}
          <RequirementCard
            title="Disk Space"
            description="Available storage for containers and data"
            status={prerequisites.diskSpace.sufficient ? 'success' : 'warning'}
            version={`${prerequisites.diskSpace.availableGb.toFixed(1)} GB available`}
            details={
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Available</span>
                  <span>
                    {prerequisites.diskSpace.availableGb.toFixed(1)} GB
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span>{prerequisites.diskSpace.totalGb.toFixed(1)} GB</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Required</span>
                  <span>5 GB minimum</span>
                </div>
                <Progress
                  value={
                    ((prerequisites.diskSpace.totalGb -
                      prerequisites.diskSpace.availableGb) /
                      prerequisites.diskSpace.totalGb) *
                    100
                  }
                  className="h-2"
                />
              </div>
            }
          />

          {/* Errors Summary */}
          {prerequisites.errors.length > 0 && (
            <Card className="border-destructive/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <StatusIcon status="error" />
                    Issues Found ({prerequisites.errors.length})
                  </CardTitle>
                  {onOpenInstallationGuide && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onOpenInstallationGuide}
                    >
                      Troubleshoot
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {prerequisites.errors.map((error) => (
                  <ErrorItem
                    key={`${error.code}-${error.message}`}
                    error={error}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Success Message */}
          {prerequisites.allPassed && (
            <Alert className="border-success/50 bg-success/10">
              <StatusIcon status="success" />
              <AlertTitle>All Requirements Met</AlertTitle>
              <AlertDescription>
                Your system is ready for OpenClaw installation.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}

// Helper Components

interface RequirementCardProps {
  title: string;
  description: string;
  status: 'success' | 'warning' | 'error' | 'loading';
  version?: string;
  details?: React.ReactNode;
  installGuide?: {
    title: string;
    steps: string[];
    link?: string;
  };
  actionButton?: React.ReactNode;
}

function RequirementCard({
  title,
  description,
  status,
  version,
  details,
  installGuide,
  actionButton,
}: RequirementCardProps) {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <Card
      className={cn(
        'transition-colors',
        status === 'error' && 'border-destructive/50',
        status === 'warning' && 'border-warning/50',
        status === 'success' && 'border-success/30',
      )}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <StatusIcon status={status} className="mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{title}</h3>
                {version && (
                  <Badge variant="outline" className="text-xs">
                    {version}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actionButton}
            {installGuide && (
              <Button
                size="sm"
                variant={status === 'error' ? 'default' : 'outline'}
                onClick={() => setShowGuide(!showGuide)}
              >
                {showGuide ? 'Hide Guide' : 'Fix'}
              </Button>
            )}
          </div>
        </div>

        {details && <div className="mt-4 pl-8">{details}</div>}

        {showGuide && installGuide && (
          <div className="mt-4 pl-8 p-4 rounded-md bg-muted/50">
            <h4 className="font-medium mb-2">{installGuide.title}</h4>
            <ol className="list-decimal list-inside space-y-1.5 text-sm">
              {installGuide.steps.map((step) => (
                <li key={step} className="text-muted-foreground">
                  {step}
                </li>
              ))}
            </ol>
            {installGuide.link && (
              <a
                href={installGuide.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-sm text-primary hover:underline"
              >
                Official Documentation →
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusIcon({
  status,
  className,
}: {
  status: 'success' | 'warning' | 'error' | 'loading';
  className?: string;
}) {
  const baseClass = 'h-5 w-5 flex-shrink-0';

  if (status === 'loading') {
    return <Spinner size="sm" className={cn(baseClass, className)} />;
  }

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

function ErrorItem({ error }: { error: PrerequisiteError }) {
  return (
    <div
      className={cn(
        'p-3 rounded-md text-sm',
        error.severity === 'error'
          ? 'bg-destructive/10 text-destructive'
          : error.severity === 'warning'
            ? 'bg-warning/10 text-warning'
            : 'bg-muted text-muted-foreground',
      )}
    >
      <div className="flex items-start gap-2">
        <StatusIcon
          status={error.severity === 'info' ? 'warning' : error.severity}
          className="mt-0.5 h-4 w-4"
        />
        <div>
          <p className="font-medium">{error.message}</p>
          {error.suggestion && (
            <p className="text-xs mt-1 opacity-80">{error.suggestion}</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface WslStatus {
  installed: boolean;
  isWsl2: boolean;
  distributions: Array<{
    name: string;
    isDefault: boolean;
    wslVersion: number;
    state: string;
  }>;
  defaultDistro?: string;
  error?: string;
}

function WslDetails({
  wslStatus,
  expanded,
  onToggle,
}: {
  wslStatus: WslStatus;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!wslStatus.installed) {
    return (
      <p className="text-sm text-muted-foreground">
        WSL2 is required on Windows for running Docker commands.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        {wslStatus.distributions.length} distribution(s) installed
        <span className="ml-1">{expanded ? '▼' : '▶'}</span>
      </Button>

      {expanded && wslStatus.distributions.length > 0 && (
        <div className="space-y-1 mt-2">
          {wslStatus.distributions.map((distro) => (
            <div
              key={distro.name}
              className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{distro.name}</span>
                {distro.isDefault && (
                  <Badge variant="secondary" className="text-xs">
                    default
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>WSL{distro.wslVersion}</span>
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    distro.state.toLowerCase() === 'running'
                      ? 'bg-success'
                      : 'bg-muted-foreground',
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DependencyStatus {
  installed: boolean;
  running?: boolean;
  version?: string;
  error?: string;
}

function DockerDetails({
  docker,
  platform,
}: {
  docker: DependencyStatus;
  platform: string;
}) {
  if (!docker.installed) {
    return (
      <p className="text-sm text-muted-foreground">
        Docker is required to run OpenClaw containers.
        {platform === 'windows' &&
          ' On Windows, Docker Desktop is recommended.'}
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Status</span>
        <span
          className={cn(
            'font-medium',
            docker.running ? 'text-success' : 'text-warning',
          )}
        >
          {docker.running ? 'Running' : 'Stopped'}
        </span>
      </div>
      {docker.error && (
        <p className="text-xs text-destructive">{docker.error}</p>
      )}
    </div>
  );
}

// Helper functions

function getWslStatus(wslStatus: WslStatus): 'success' | 'warning' | 'error' {
  if (!wslStatus.installed) return 'error';
  if (!wslStatus.isWsl2) return 'error';
  if (wslStatus.distributions.length === 0) return 'warning';
  return 'success';
}

function getDockerStatus(
  docker: DependencyStatus,
): 'success' | 'warning' | 'error' {
  if (!docker.installed) return 'error';
  if (!docker.running) return 'warning';
  return 'success';
}

function getDockerInstallGuide(platform: string) {
  if (platform === 'windows') {
    return {
      title: 'Install Docker Desktop for Windows',
      steps: [
        'Download Docker Desktop from docker.com',
        'Run the installer',
        'Enable WSL 2 backend during installation',
        'Start Docker Desktop',
        'Wait for Docker to finish starting',
      ],
      link: 'https://www.docker.com/products/docker-desktop/',
    };
  }

  if (platform === 'macos') {
    return {
      title: 'Install Docker Desktop for macOS',
      steps: [
        'Download Docker Desktop from docker.com',
        'Open the .dmg file',
        'Drag Docker to Applications',
        'Launch Docker from Applications',
        'Grant necessary permissions when prompted',
      ],
      link: 'https://www.docker.com/products/docker-desktop/',
    };
  }

  // Linux
  return {
    title: 'Install Docker Engine',
    steps: [
      'Update package index: sudo apt update',
      'Install prerequisites: sudo apt install ca-certificates curl gnupg',
      "Add Docker's GPG key and repository",
      'Install Docker: sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin',
      'Add your user to docker group: sudo usermod -aG docker $USER',
      'Log out and back in for group changes to take effect',
    ],
    link: 'https://docs.docker.com/engine/install/',
  };
}

function getGitInstallGuide(platform: string) {
  if (platform === 'windows') {
    return {
      title: 'Install Git in WSL2',
      steps: [
        'Open your WSL terminal',
        'Run: sudo apt update',
        'Run: sudo apt install -y git',
        'Verify with: git --version',
      ],
      link: 'https://git-scm.com/download/win',
    };
  }

  if (platform === 'macos') {
    return {
      title: 'Install Git on macOS',
      steps: [
        'Option 1: Run xcode-select --install',
        'Option 2: Install Homebrew and run brew install git',
        'Verify with: git --version',
      ],
      link: 'https://git-scm.com/download/mac',
    };
  }

  return {
    title: 'Install Git on Linux',
    steps: [
      'Debian/Ubuntu: sudo apt install -y git',
      'Fedora: sudo dnf install -y git',
      'Arch: sudo pacman -S git',
      'Verify with: git --version',
    ],
    link: 'https://git-scm.com/download/linux',
  };
}

export default PrerequisitesChecker;
