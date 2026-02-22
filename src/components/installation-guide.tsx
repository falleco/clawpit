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

interface DiskSpaceInfo {
  availableGb: number;
  totalGb: number;
  sufficient: boolean;
  path: string;
}

interface PrerequisiteError {
  code: string;
  message: string;
  suggestion?: string;
  severity: 'error' | 'warning' | 'info';
}

interface PrerequisiteStatus {
  platform: 'windows' | 'macos' | 'linux';
  wslStatus?: WslStatus;
  docker: DependencyStatus;
  dockerCompose: DependencyStatus;
  git: DependencyStatus;
  network: {
    reachable: boolean;
    endpoint: string;
    latencyMs?: number;
    error?: string;
  };
  diskSpace: DiskSpaceInfo;
  allPassed: boolean;
  errors: PrerequisiteError[];
  timestamp: string;
}

type IssueType =
  | 'docker-not-installed'
  | 'docker-not-running'
  | 'docker-permission'
  | 'compose-not-installed'
  | 'git-not-installed'
  | 'network-unreachable'
  | 'wsl-not-installed'
  | 'wsl-not-wsl2'
  | 'wsl-no-distro'
  | 'wsl-distro-stopped'
  | 'disk-space'
  | 'unknown';

interface DetectedIssue {
  type: IssueType;
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  solutions: Solution[];
}

interface Solution {
  title: string;
  steps: string[];
  commands?: string[];
  link?: string;
  linkText?: string;
}

interface InstallationGuideProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function InstallationGuide({
  onComplete,
  onCancel,
}: InstallationGuideProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PrerequisiteStatus | null>(null);
  const [detectedIssues, setDetectedIssues] = useState<DetectedIssue[]>([]);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [visitedLinks, setVisitedLinks] = useState<Set<string>>(new Set());

  // Check prerequisites
  const checkPrerequisites = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await invoke<PrerequisiteStatus>('check_prerequisites');
      setStatus(result);

      // Detect issues based on status
      const issues = detectIssues(result);
      setDetectedIssues(issues);

      // Auto-expand first error
      const firstError = issues.find((i) => i.severity === 'error');
      if (firstError) {
        setExpandedIssue(firstError.type);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPrerequisites();
  }, [checkPrerequisites]);

  // Open external link and track it
  const openLink = (url: string) => {
    void openUrl(url);
    setVisitedLinks((prev) => new Set([...prev, url]));
  };

  // Get overall progress
  const getProgress = () => {
    if (!status) return 0;
    const total = detectedIssues.length;
    if (total === 0) return 100;
    const resolved = detectedIssues.filter(
      (i) => i.severity !== 'error',
    ).length;
    return Math.round((resolved / total) * 100);
  };

  // Count issues by severity
  const errorCount = detectedIssues.filter(
    (i) => i.severity === 'error',
  ).length;
  const warningCount = detectedIssues.filter(
    (i) => i.severity === 'warning',
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Installation Guide</CardTitle>
              <CardDescription>
                Troubleshoot and resolve dependency issues
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {onCancel && (
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={checkPrerequisites}
                disabled={loading}
              >
                {loading ? <Spinner size="sm" className="mr-2" /> : null}
                Recheck
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <StatusIcon status="error" className="h-4 w-4" />
                  {errorCount} error{errorCount > 1 ? 's' : ''}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-warning">
                  <StatusIcon status="warning" className="h-4 w-4" />
                  {warningCount} warning{warningCount > 1 ? 's' : ''}
                </span>
              )}
              {errorCount === 0 && warningCount === 0 && status && (
                <span className="flex items-center gap-1 text-success">
                  <StatusIcon status="success" className="h-4 w-4" />
                  All checks passed
                </span>
              )}
            </div>
            {status && (
              <Badge variant="outline" className="capitalize">
                {status.platform}
              </Badge>
            )}
          </div>
          <Progress value={getProgress()} className="h-2" />
        </CardContent>
      </Card>

      {/* Error display */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading state */}
      {loading && !status && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-3">
              <Spinner size="lg" />
              <p className="text-muted-foreground">Analyzing system...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Issues list */}
      {status && detectedIssues.length > 0 && (
        <div className="space-y-3">
          {detectedIssues.map((issue) => (
            <IssueCard
              key={issue.type}
              issue={issue}
              expanded={expandedIssue === issue.type}
              onToggle={() =>
                setExpandedIssue(
                  expandedIssue === issue.type ? null : issue.type,
                )
              }
              onOpenLink={openLink}
              visitedLinks={visitedLinks}
            />
          ))}
        </div>
      )}

      {/* All resolved */}
      {status && detectedIssues.length === 0 && (
        <Card className="border-success/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusIcon status="success" />
              All Dependencies Ready
            </CardTitle>
            <CardDescription>
              Your system meets all requirements for OpenClaw.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <StatusItem
                label="Docker"
                status="success"
                value={status.docker.version}
              />
              <StatusItem
                label="Docker Compose"
                status="success"
                value={status.dockerCompose.version}
              />
              <StatusItem
                label="Git"
                status="success"
                value={status.git.version}
              />
              <StatusItem
                label="Network"
                status="success"
                value={
                  status.network.latencyMs
                    ? `${status.network.latencyMs} ms`
                    : 'Reachable'
                }
              />
              <StatusItem
                label="Disk Space"
                status="success"
                value={`${status.diskSpace.availableGb.toFixed(1)} GB`}
              />
            </div>
            {onComplete && (
              <div className="flex justify-end mt-4">
                <Button onClick={onComplete}>Continue</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Common errors reference */}
      {status && detectedIssues.some((i) => i.severity === 'error') && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Need Help?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              If you're stuck, try these resources:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openLink('https://docs.docker.com/get-docker/')}
              >
                Docker Docs
              </Button>
              {status.platform === 'windows' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openLink('https://learn.microsoft.com/en-us/windows/wsl/')
                  }
                >
                  WSL Docs
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Issue Card Component
function IssueCard({
  issue,
  expanded,
  onToggle,
  onOpenLink,
  visitedLinks,
}: {
  issue: DetectedIssue;
  expanded: boolean;
  onToggle: () => void;
  onOpenLink: (url: string) => void;
  visitedLinks: Set<string>;
}) {
  return (
    <Card
      className={cn(
        'transition-colors',
        issue.severity === 'error' && 'border-destructive/50',
        issue.severity === 'warning' && 'border-warning/50',
      )}
    >
      <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon
              status={issue.severity === 'info' ? 'warning' : issue.severity}
            />
            <CardTitle className="text-base">{issue.title}</CardTitle>
          </div>
          <Button variant="ghost" size="sm">
            {expanded ? '▼' : '▶'}
          </Button>
        </div>
        <CardDescription>{issue.description}</CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {issue.solutions.map((solution) => (
            <div key={solution.title} className="p-4 rounded-md bg-muted">
              <h4 className="font-medium mb-2">{solution.title}</h4>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                {solution.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {solution.commands && solution.commands.length > 0 && (
                <div className="mt-3 space-y-1">
                  {solution.commands.map((cmd) => (
                    <code
                      key={cmd}
                      className="block p-2 bg-background rounded text-xs font-mono"
                    >
                      {cmd}
                    </code>
                  ))}
                </div>
              )}
              {solution.link && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'mt-3',
                    visitedLinks.has(solution.link) && 'opacity-60',
                  )}
                  onClick={() => onOpenLink(solution.link ?? '')}
                >
                  {solution.linkText || 'Learn More'}
                  {visitedLinks.has(solution.link) && ' ✓'}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// Helper Components
function StatusItem({
  label,
  status,
  value,
}: {
  label: string;
  status: 'success' | 'warning' | 'error';
  value?: string;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
      <div className="flex items-center gap-2">
        <StatusIcon status={status} className="h-4 w-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {value && (
        <Badge variant="outline" className="text-xs">
          {value}
        </Badge>
      )}
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
  const baseClass = cn('h-5 w-5 flex-shrink-0', className);

  if (status === 'success') {
    return (
      <svg
        aria-hidden="true"
        className={cn(baseClass, 'text-success')}
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
        className={cn(baseClass, 'text-warning')}
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
      className={cn(baseClass, 'text-destructive')}
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

// Issue Detection Logic
function detectIssues(status: PrerequisiteStatus): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // WSL issues (Windows only)
  if (status.platform === 'windows' && status.wslStatus) {
    if (!status.wslStatus.installed) {
      issues.push({
        type: 'wsl-not-installed',
        title: 'WSL2 Not Installed',
        description:
          'Windows Subsystem for Linux 2 is required for running Docker.',
        severity: 'error',
        solutions: [
          {
            title: 'Install WSL2',
            steps: [
              'Open PowerShell as Administrator',
              'Run the installation command',
              'Restart your computer when prompted',
              'Complete the Ubuntu setup after restart',
            ],
            commands: ['wsl --install'],
            link: 'https://learn.microsoft.com/en-us/windows/wsl/install',
            linkText: 'WSL Installation Guide',
          },
        ],
      });
    } else if (!status.wslStatus.isWsl2) {
      issues.push({
        type: 'wsl-not-wsl2',
        title: 'WSL2 Not Default',
        description: 'WSL1 is installed but WSL2 is required for Docker.',
        severity: 'error',
        solutions: [
          {
            title: 'Set WSL2 as Default',
            steps: [
              'Open PowerShell as Administrator',
              'Set WSL2 as the default version',
              'Convert existing distributions if needed',
            ],
            commands: [
              'wsl --set-default-version 2',
              'wsl --set-version Ubuntu 2',
            ],
          },
        ],
      });
    } else if (status.wslStatus.distributions.length === 0) {
      issues.push({
        type: 'wsl-no-distro',
        title: 'No WSL Distribution',
        description:
          'WSL2 is installed but no Linux distribution is available.',
        severity: 'error',
        solutions: [
          {
            title: 'Install Ubuntu',
            steps: [
              'Open Microsoft Store',
              "Search for 'Ubuntu'",
              "Click 'Get' to install",
              'Launch Ubuntu and create a user account',
            ],
            link: 'ms-windows-store://search/?query=Ubuntu',
            linkText: 'Open Microsoft Store',
          },
          {
            title: 'Or Install via Command Line',
            steps: ['Open PowerShell and run the install command'],
            commands: ['wsl --install -d Ubuntu'],
          },
        ],
      });
    } else {
      // Check if default distro is running
      const defaultDistro = status.wslStatus.distributions.find(
        (d) => d.isDefault,
      );
      if (defaultDistro && defaultDistro.state.toLowerCase() !== 'running') {
        issues.push({
          type: 'wsl-distro-stopped',
          title: 'WSL Distribution Not Running',
          description: `The default distribution (${defaultDistro.name}) is not running.`,
          severity: 'warning',
          solutions: [
            {
              title: 'Start the Distribution',
              steps: [
                'Open the distribution from Start menu, or',
                'Use the command line to start it',
              ],
              commands: [`wsl -d ${defaultDistro.name}`],
            },
          ],
        });
      }
    }
  }

  // Docker issues
  if (!status.docker.installed) {
    issues.push({
      type: 'docker-not-installed',
      title: 'Docker Not Installed',
      description: 'Docker is required for running OpenClaw services.',
      severity: 'error',
      solutions: getDockerInstallSolutions(status.platform),
    });
  } else if (!status.docker.running) {
    issues.push({
      type: 'docker-not-running',
      title: 'Docker Daemon Not Running',
      description: 'Docker is installed but the daemon is not running.',
      severity: 'error',
      solutions: getDockerStartSolutions(status.platform),
    });
  }

  // Docker Compose issues
  if (!status.dockerCompose.installed && status.docker.installed) {
    issues.push({
      type: 'compose-not-installed',
      title: 'Docker Compose Not Available',
      description:
        'Docker Compose v2 is required for managing multi-container applications.',
      severity: 'error',
      solutions: [
        {
          title: 'Install Docker Compose Plugin',
          steps:
            status.platform === 'linux'
              ? [
                  'Docker Compose v2 comes as a plugin',
                  'Install via your package manager',
                ]
              : ['Docker Compose v2 is included with Docker Desktop'],
          commands:
            status.platform === 'linux'
              ? ['sudo apt-get install docker-compose-plugin']
              : undefined,
        },
      ],
    });
  }

  // Git issues
  if (!status.git.installed) {
    issues.push({
      type: 'git-not-installed',
      title: 'Git Not Installed',
      description:
        'Git is required for cloning and updating OpenClaw workspaces.',
      severity: 'error',
      solutions: getGitInstallSolutions(status.platform),
    });
  }

  // Network issues
  if (!status.network.reachable) {
    issues.push({
      type: 'network-unreachable',
      title: 'Internet Connectivity Issue',
      description:
        'Clawpit could not reach the internet for dependency checks.',
      severity: 'warning',
      solutions: [
        {
          title: 'Check Network Access',
          steps: [
            'Verify your internet connection is active',
            'Disable VPN/proxy temporarily and recheck',
            'Allow Docker and Git through your firewall',
            'Retry the dependency check',
          ],
          link: 'https://docs.docker.com/engine/install/troubleshoot/',
          linkText: 'Docker Network Troubleshooting',
        },
      ],
    });
  }

  // Disk space issues
  if (!status.diskSpace.sufficient) {
    issues.push({
      type: 'disk-space',
      title: 'Low Disk Space',
      description: `Only ${status.diskSpace.availableGb.toFixed(1)} GB available. 5 GB minimum recommended.`,
      severity: 'warning',
      solutions: [
        {
          title: 'Free Up Disk Space',
          steps: [
            'Delete unnecessary files and applications',
            'Clear Docker images and containers if previously installed',
            'Empty trash/recycle bin',
          ],
          commands: status.docker.installed
            ? ['docker system prune -a']
            : undefined,
        },
      ],
    });
  }

  return issues;
}

// Platform-specific solutions
function getDockerInstallSolutions(platform: string): Solution[] {
  if (platform === 'windows') {
    return [
      {
        title: 'Install Docker Desktop (Recommended)',
        steps: [
          'Download Docker Desktop from docker.com',
          'Run the installer',
          "Enable 'Use WSL 2 based engine' during setup",
          'Restart your computer if prompted',
          'Launch Docker Desktop',
        ],
        link: 'https://www.docker.com/products/docker-desktop/',
        linkText: 'Download Docker Desktop',
      },
      {
        title: 'Or Install Docker in WSL2 (Advanced)',
        steps: [
          'Open your WSL2 terminal',
          'Install Docker using apt',
          'Add your user to the docker group',
          'Start the Docker service',
        ],
        commands: [
          'sudo apt-get update',
          'sudo apt-get install -y docker.io docker-compose-plugin',
          'sudo usermod -aG docker $USER',
          'sudo service docker start',
        ],
      },
    ];
  }

  if (platform === 'macos') {
    return [
      {
        title: 'Install Docker Desktop for Mac',
        steps: [
          'Download Docker Desktop from docker.com',
          'Open the .dmg file',
          'Drag Docker to Applications',
          'Launch Docker from Applications',
          'Grant permissions when prompted',
        ],
        link: 'https://www.docker.com/products/docker-desktop/',
        linkText: 'Download Docker Desktop',
      },
    ];
  }

  // Linux
  return [
    {
      title: 'Install Docker Engine',
      steps: [
        'Update package index',
        'Install Docker and Compose plugin',
        'Add your user to docker group',
        'Enable and start Docker service',
        'Log out and back in for group changes',
      ],
      commands: [
        'sudo apt-get update',
        'sudo apt-get install -y docker.io docker-compose-plugin',
        'sudo usermod -aG docker $USER',
        'sudo systemctl enable --now docker',
      ],
      link: 'https://docs.docker.com/engine/install/',
      linkText: 'Official Installation Guide',
    },
  ];
}

function getDockerStartSolutions(platform: string): Solution[] {
  if (platform === 'windows') {
    return [
      {
        title: 'Start Docker Desktop',
        steps: [
          'Open Docker Desktop from the Start menu',
          'Wait for Docker to finish starting',
          'Look for the whale icon in the system tray',
        ],
      },
      {
        title: 'If Using Docker in WSL2',
        steps: ['Open your WSL terminal', 'Start the Docker service'],
        commands: ['sudo service docker start'],
      },
    ];
  }

  if (platform === 'macos') {
    return [
      {
        title: 'Start Docker Desktop',
        steps: [
          'Open Docker Desktop from Applications',
          'Wait for Docker to finish starting',
          'Look for the whale icon in the menu bar',
        ],
      },
    ];
  }

  // Linux
  return [
    {
      title: 'Start Docker Service',
      steps: ['Start the Docker daemon using systemctl or service'],
      commands: [
        'sudo systemctl start docker',
        '# Or: sudo service docker start',
      ],
    },
    {
      title: 'Enable Docker on Boot',
      steps: ['Configure Docker to start automatically on boot'],
      commands: ['sudo systemctl enable docker'],
    },
  ];
}

function getGitInstallSolutions(platform: string): Solution[] {
  if (platform === 'windows') {
    return [
      {
        title: 'Install Git in WSL2',
        steps: [
          'Open your WSL terminal',
          'Update package index',
          'Install git',
          'Verify git version',
        ],
        commands: [
          'sudo apt-get update',
          'sudo apt-get install -y git',
          'git --version',
        ],
        link: 'https://git-scm.com/download/win',
        linkText: 'Git Download',
      },
    ];
  }

  if (platform === 'macos') {
    return [
      {
        title: 'Install Git on macOS',
        steps: [
          'Run xcode-select --install, or',
          'Install with Homebrew',
          'Verify git version',
        ],
        commands: [
          'xcode-select --install',
          'brew install git',
          'git --version',
        ],
        link: 'https://git-scm.com/download/mac',
        linkText: 'Git Download',
      },
    ];
  }

  return [
    {
      title: 'Install Git on Linux',
      steps: ['Install Git with your package manager', 'Verify installation'],
      commands: ['sudo apt-get install -y git', 'git --version'],
      link: 'https://git-scm.com/download/linux',
      linkText: 'Git Download',
    },
  ];
}

export default InstallationGuide;
