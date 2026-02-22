import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Container,
  Download,
  ExternalLink,
  FileText,
  Globe,
  MessageCircle,
  MoreVertical,
  Play,
  RotateCcw,
  Settings,
  Shield,
  Square,
  Terminal,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ClawpitInstance } from '@/stores';
import type {
  InstanceAgents,
  InstanceContainersInfo,
  OpenClawAgent,
} from '@/types';

interface InstanceCardProps {
  instance: ClawpitInstance;
  clawpitDir: string;
  isActive: boolean;
  onSelect: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewLogs?: () => void;
  onPullUpdates?: () => void;
  onOpenTerminal?: () => void;
}

const statusColors: Record<ClawpitInstance['status'], string> = {
  running: 'bg-green-500',
  stopped: 'bg-gray-500',
  starting: 'bg-yellow-500',
  stopping: 'bg-yellow-500',
  error: 'bg-red-500',
  unknown: 'bg-gray-400',
};

const statusLabels: Record<ClawpitInstance['status'], string> = {
  running: 'Running',
  stopped: 'Stopped',
  starting: 'Starting...',
  stopping: 'Stopping...',
  error: 'Error',
  unknown: 'Unknown',
};

export function InstanceCard({
  instance,
  clawpitDir,
  isActive,
  onSelect,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onDelete,
  onViewLogs,
  onPullUpdates,
  onOpenTerminal,
}: InstanceCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [containersInfo, setContainersInfo] =
    useState<InstanceContainersInfo | null>(null);
  const [agents, setAgents] = useState<OpenClawAgent[]>([]);
  const isRunning = instance.status === 'running';
  const isStopped = instance.status === 'stopped';
  const isTransitioning =
    instance.status === 'starting' || instance.status === 'stopping';

  // Count enabled providers
  const enabledProviders = [
    instance.providers.whatsapp && 'WhatsApp',
    instance.providers.telegram.enabled && 'Telegram',
    instance.providers.discord.enabled && 'Discord',
  ].filter((p): p is string => Boolean(p));

  useEffect(() => {
    let isMounted = true;

    const fetchContainersInfo = async () => {
      try {
        const info = await invoke<InstanceContainersInfo>(
          'get_instance_containers_info',
          {
            clawpitDir,
            instanceId: instance.id,
            wslDistro: null,
          },
        );
        if (isMounted) {
          setContainersInfo(info);
        }
      } catch (err) {
        console.error('Failed to fetch instance containers info:', err);
        if (isMounted) {
          setContainersInfo(null);
        }
      }
    };

    void fetchContainersInfo();

    const shouldPoll =
      instance.status === 'running' ||
      instance.status === 'starting' ||
      instance.status === 'stopping';

    if (!shouldPoll) {
      return () => {
        isMounted = false;
      };
    }

    const interval = setInterval(() => {
      void fetchContainersInfo();
    }, 8000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [clawpitDir, instance.id, instance.status]);

  // Fetch agents from OpenClaw config
  useEffect(() => {
    let isMounted = true;

    const fetchAgents = async () => {
      try {
        const result = await invoke<InstanceAgents>('get_instance_agents', {
          clawpitDir,
          instanceId: instance.id,
        });
        if (isMounted) {
          setAgents(result.agents);
        }
      } catch (err) {
        console.error('Failed to fetch instance agents:', err);
        if (isMounted) {
          setAgents([]);
        }
      }
    };

    void fetchAgents();

    return () => {
      isMounted = false;
    };
  }, [clawpitDir, instance.id]);

  const getContainerStatusColor = (
    container: InstanceContainersInfo['gateway'],
  ): string => {
    if (!container) {
      return 'bg-gray-400';
    }

    if (
      container.hasErrors ||
      container.state === 'restarting' ||
      container.state === 'dead'
    ) {
      return 'bg-red-500';
    }

    if (container.state === 'running') {
      return 'bg-green-500';
    }

    return 'bg-gray-400';
  };

  // Get agent display name
  const getAgentDisplayName = (agent: OpenClawAgent): string => {
    if (agent.identity.name) return agent.identity.name;
    if (agent.name) return agent.name;
    return agent.id;
  };

  // Get agent initials for avatar
  const getAgentInitials = (agent: OpenClawAgent): string => {
    const name = getAgentDisplayName(agent);
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Generate a consistent color based on agent id
  const getAgentColor = (agentId: string): string => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-cyan-500',
      'bg-indigo-500',
      'bg-teal-500',
    ];
    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const renderContainerRow = (
    label: string,
    container: InstanceContainersInfo['gateway'],
  ) => (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${getContainerStatusColor(container)}`}
        />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-mono text-foreground/90">
        {container?.id || '-'}
      </span>
    </div>
  );

  return (
    <Card
      className={`relative cursor-pointer transition-all hover:border-primary/50 ${
        isActive ? 'border-primary ring-2 ring-primary/20' : ''
      }`}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {instance.name}
              <span
                className={`inline-block h-2 w-2 rounded-full ${statusColors[instance.status]}`}
                title={statusLabels[instance.status]}
              />
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {instance.description || 'No description'}
            </CardDescription>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Terminal button */}
            {onOpenTerminal && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTerminal();
                      }}
                    >
                      <Terminal className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open Terminal</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Menu button */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>

              {showMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-transparent border-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' || e.key === 'Enter') {
                        e.stopPropagation();
                        setShowMenu(false);
                      }
                    }}
                    aria-label="Close menu"
                  />
                  <div className="absolute right-0 top-8 z-50 w-48 rounded-md border border-border bg-popover p-1 shadow-md">
                    {onViewLogs && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          onViewLogs();
                        }}
                      >
                        <FileText className="h-4 w-4" />
                        View Logs
                      </button>
                    )}
                    {onPullUpdates && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          onPullUpdates();
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Pull Updates
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onEdit();
                      }}
                    >
                      <Settings className="h-4 w-4" />
                      Edit Configuration
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Instance
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Network info */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-primary transition-colors group"
            onClick={(e) => {
              e.stopPropagation();
              const host =
                instance.bindMode === 'local' ? 'localhost' : '127.0.0.1';
              const url = instance.authToken
                ? `http://${host}:${instance.gatewayPort}?token=${encodeURIComponent(instance.authToken)}`
                : `http://${host}:${instance.gatewayPort}`;
              openUrl(url).catch((err) => {
                console.error('Failed to open URL:', err);
              });
            }}
            title="Open gateway in browser"
          >
            <Globe className="h-4 w-4" />
            <span>Gateway: {instance.gatewayPort}</span>
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            <span>Bridge: {instance.bridgePort}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Gateway IP:</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground/90">
            {containersInfo?.gateway?.ipAddress || 'Unavailable'}
          </code>
        </div>

        {/* Providers */}
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          {enabledProviders.length > 0 ? (
            <div className="flex gap-1">
              {enabledProviders.map((provider) => (
                <Badge key={provider} variant="secondary" className="text-xs">
                  {provider}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              No providers enabled
            </span>
          )}
        </div>

        {/* Bind mode */}
        <div className="text-sm text-muted-foreground">
          Bind:{' '}
          {instance.bindMode === 'local' ? 'Localhost only' : 'LAN accessible'}
        </div>

        {/* Gateway/Ingress containers */}
        <div className="rounded-md border border-border/60 bg-muted/30 p-2">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Container className="h-3.5 w-3.5" />
            Containers
          </div>
          <div className="space-y-1">
            {renderContainerRow('Gateway', containersInfo?.gateway ?? null)}
            {renderContainerRow('Ingress', containersInfo?.ingress ?? null)}
          </div>
        </div>

        {/* Team/Agents avatars */}
        {agents.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <TooltipProvider delayDuration={200}>
              <div className="flex -space-x-2">
                {agents.slice(0, 5).map((agent) => (
                  <Tooltip key={agent.id}>
                    <TooltipTrigger asChild>
                      <div
                        className={`h-7 w-7 rounded-full ${getAgentColor(agent.id)} flex items-center justify-center text-[10px] font-medium text-white ring-2 ring-background cursor-default`}
                      >
                        {agent.identity.emoji || getAgentInitials(agent)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">
                        {getAgentDisplayName(agent)}
                      </p>
                      {agent.identity.theme && (
                        <p className="text-muted-foreground">
                          {agent.identity.theme}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                ))}
                {agents.length > 5 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground ring-2 ring-background cursor-default">
                        +{agents.length - 5}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p>{agents.length - 5} more agents</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2">
          {isStopped && (
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
            >
              <Play className="h-4 w-4 mr-1" />
              Start
            </Button>
          )}
          {isRunning && (
            <>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onStop();
                }}
              >
                <Square className="h-4 w-4 mr-1" />
                Stop
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestart();
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
          {isTransitioning && (
            <Button size="sm" variant="outline" className="flex-1" disabled>
              {statusLabels[instance.status]}
            </Button>
          )}
          {instance.status === 'error' && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
            >
              <Play className="h-4 w-4 mr-1" />
              Retry
            </Button>
          )}
          {instance.status === 'unknown' && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
            >
              <Play className="h-4 w-4 mr-1" />
              Start
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
