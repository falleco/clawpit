import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Check,
  Container,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  MessageCircle,
  Shield,
  Terminal,
  Trash2,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type ClawpitInstance, useInstanceStore } from '@/stores';
import type {
  InstanceAgents,
  InstanceContainersInfo,
  OpenClawAgent,
} from '@/types';
import { LogViewer } from '../dashboard/log-viewer';

interface InstanceDetailProps {
  instance: ClawpitInstance;
  clawpitDir: string;
  onBack: () => void;
  onOpenSettings?: () => void;
  onOpenTerminal?: (instance: ClawpitInstance) => void;
}

export function InstanceDetail({
  instance,
  clawpitDir,
  onBack,
  onOpenTerminal,
}: InstanceDetailProps) {
  const { deleteInstance, pullInstanceUpdates } = useInstanceStore();

  const [containersInfo, setContainersInfo] =
    useState<InstanceContainersInfo | null>(null);
  const [agents, setAgents] = useState<OpenClawAgent[]>([]);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isPullingUpdates, setIsPullingUpdates] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [logViewerOpen, setLogViewerOpen] = useState(false);

  // Listen for external log viewer open event (from navbar)
  useEffect(() => {
    const handleOpenLogs = (event: Event) => {
      const customEvent = event as CustomEvent<{ instanceId: string }>;
      if (customEvent.detail.instanceId === instance.id) {
        setLogViewerOpen(true);
      }
    };

    window.addEventListener('open-instance-logs', handleOpenLogs);
    return () => {
      window.removeEventListener('open-instance-logs', handleOpenLogs);
    };
  }, [instance.id]);

  // Fetch containers info
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

  const handleCopyToken = useCallback(async () => {
    if (!instance.authToken) return;

    try {
      await navigator.clipboard.writeText(instance.authToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch (err) {
      console.error('Failed to copy token:', err);
    }
  }, [instance.authToken]);

  const handleOpenGateway = useCallback(() => {
    const host = instance.bindMode === 'local' ? 'localhost' : '127.0.0.1';
    const url = instance.authToken
      ? `http://${host}:${instance.gatewayPort}?token=${encodeURIComponent(instance.authToken)}`
      : `http://${host}:${instance.gatewayPort}`;
    openUrl(url).catch((err) => {
      console.error('Failed to open URL:', err);
    });
  }, [instance.authToken, instance.bindMode, instance.gatewayPort]);

  const handlePullUpdates = async () => {
    setIsPullingUpdates(true);
    try {
      await pullInstanceUpdates(instance.id);
    } catch (err) {
      console.error('Failed to pull updates:', err);
    } finally {
      setIsPullingUpdates(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteInstance(instance.id);
      setDeleteDialogOpen(false);
      onBack();
    } finally {
      setIsDeleting(false);
    }
  };

  const getContainerStatusColor = (
    container: InstanceContainersInfo['gateway'],
  ): string => {
    if (!container) return 'bg-gray-400';

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

  return (
    <div className="h-full space-y-6">
      {/* Description */}
      {instance.description && (
        <p className="text-sm text-muted-foreground">{instance.description}</p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Network Configuration */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Network Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gateway Port</span>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 font-mono">
                    {instance.gatewayPort}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleOpenGateway}
                    title="Open in browser"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bridge Port</span>
                <code className="rounded bg-muted px-2 py-1 font-mono">
                  {instance.bridgePort}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bind Mode</span>
                <Badge variant="outline">
                  {instance.bindMode === 'local'
                    ? 'Localhost only'
                    : 'LAN accessible'}
                </Badge>
              </div>
              {instance.authToken && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Auth Token</span>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm max-w-[150px] truncate">
                      {instance.tokenGenerated
                        ? '••••••••••••'
                        : instance.authToken}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void handleCopyToken()}
                      title="Copy token"
                    >
                      {copiedToken ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Containers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Container className="h-5 w-5" />
              Containers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Gateway container */}
            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${getContainerStatusColor(containersInfo?.gateway ?? null)}`}
                  />
                  <span className="font-medium">Gateway</span>
                </div>
                <code className="text-xs font-mono text-muted-foreground">
                  {containersInfo?.gateway?.id || '-'}
                </code>
              </div>
              {containersInfo?.gateway?.ipAddress && (
                <div className="mt-2 text-sm text-muted-foreground">
                  IP: {containersInfo.gateway.ipAddress}
                </div>
              )}
            </div>

            {/* Ingress container */}
            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${getContainerStatusColor(containersInfo?.ingress ?? null)}`}
                  />
                  <span className="font-medium">Ingress</span>
                </div>
                <code className="text-xs font-mono text-muted-foreground">
                  {containersInfo?.ingress?.id || '-'}
                </code>
              </div>
              {containersInfo?.ingress?.ipAddress && (
                <div className="mt-2 text-sm text-muted-foreground">
                  IP: {containersInfo.ingress.ipAddress}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Messaging Providers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Messaging Providers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">WhatsApp</span>
              <Badge
                variant={instance.providers.whatsapp ? 'default' : 'secondary'}
              >
                {instance.providers.whatsapp ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Telegram</span>
              <Badge
                variant={
                  instance.providers.telegram.enabled ? 'default' : 'secondary'
                }
              >
                {instance.providers.telegram.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discord</span>
              <Badge
                variant={
                  instance.providers.discord.enabled ? 'default' : 'secondary'
                }
              >
                {instance.providers.discord.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Instance Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Instance Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Path</span>
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all text-right">
                {instance.path}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(instance.createdAt).toLocaleDateString()}</span>
            </div>
            {instance.lastUsedAt && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last Used</span>
                <span>
                  {new Date(instance.lastUsedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Section */}
      {agents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3"
                >
                  {/* Agent Avatar */}
                  <div
                    className={`h-10 w-10 shrink-0 rounded-full ${getAgentColor(agent.id)} flex items-center justify-center text-sm font-medium text-white`}
                  >
                    {agent.identity.emoji || getAgentInitials(agent)}
                  </div>
                  {/* Agent Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {getAgentDisplayName(agent)}
                    </p>
                    {agent.identity.theme && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {agent.identity.theme}
                      </p>
                    )}
                    {agent.skills.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {agent.skills.slice(0, 3).map((skill) => (
                          <Badge
                            key={skill}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {skill}
                          </Badge>
                        ))}
                        {agent.skills.length > 3 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            +{agent.skills.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* More Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            More Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenTerminal?.(instance)}
            >
              <Terminal className="h-4 w-4 mr-2" />
              Open Terminal
            </Button>
            <Button
              variant="outline"
              onClick={() => void handlePullUpdates()}
              disabled={isPullingUpdates}
            >
              <Download className="h-4 w-4 mr-2" />
              {isPullingUpdates ? 'Pulling...' : 'Pull Updates'}
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Instance
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Instance</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{instance.name}"? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="my-4">
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              All data associated with this instance will be permanently
              deleted, including configurations, logs, and Docker volumes.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Instance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log viewer dialog */}
      <Dialog open={logViewerOpen} onOpenChange={setLogViewerOpen}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <LogViewer
            instanceId={instance.id}
            instanceName={instance.name}
            onClose={() => setLogViewerOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
