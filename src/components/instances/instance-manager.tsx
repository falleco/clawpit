import { AlertCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  saveSettingsCategory,
  saveSettingsSelectedInstanceId,
} from '@/lib/settings-store';
import {
  type ClawpitInstance,
  type InstanceConfig,
  useInstanceStore,
} from '@/stores';
import { LogViewer } from '../dashboard/log-viewer';
import { CreateInstanceDialog } from './create-instance-dialog';
import { InstanceCard } from './instance-card';

interface InstanceManagerProps {
  clawpitDir: string;
  onOpenSettings?: () => void;
  onSelectInstance?: (instance: ClawpitInstance) => void;
  onOpenTerminal?: (instance: ClawpitInstance) => void;
}

export function InstanceManager({
  clawpitDir,
  onOpenSettings,
  onSelectInstance,
  onOpenTerminal,
}: InstanceManagerProps) {
  const {
    instances,
    activeInstanceId,
    isLoading,
    error,
    setClawpitDir,
    loadInstances,
    createInstance,
    deleteInstance,
    setActiveInstance,
    startInstance,
    stopInstance,
    restartInstance,
    pullInstanceUpdates,
  } = useInstanceStore();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [logViewerInstance, setLogViewerInstance] =
    useState<ClawpitInstance | null>(null);
  const [isPullingUpdates, setIsPullingUpdates] = useState<string | null>(null);

  // Initialize store with clawpit directory
  useEffect(() => {
    setClawpitDir(clawpitDir);
    loadInstances();
  }, [clawpitDir, setClawpitDir, loadInstances]);

  const handleCreateInstance = async (config: InstanceConfig) => {
    await createInstance(config);
  };

  const handleDeleteClick = (id: string) => {
    setInstanceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!instanceToDelete) return;

    setIsDeleting(true);
    try {
      await deleteInstance(instanceToDelete);
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditInstance = async (id: string) => {
    try {
      await saveSettingsCategory('advanced');
      await saveSettingsSelectedInstanceId(id);
      onOpenSettings?.();
    } catch (err) {
      console.error('Failed to open instance editor in settings:', err);
    }
  };

  const handleViewLogs = (instance: ClawpitInstance) => {
    setLogViewerInstance(instance);
  };

  const handleOpenTerminal = (instance: ClawpitInstance) => {
    onOpenTerminal?.(instance);
  };

  const handlePullUpdates = async (id: string) => {
    setIsPullingUpdates(id);
    try {
      await pullInstanceUpdates(id);
    } catch (err) {
      console.error('Failed to pull updates:', err);
    } finally {
      setIsPullingUpdates(null);
    }
  };

  const handleInstanceClick = (instance: ClawpitInstance) => {
    setActiveInstance(instance.id);
    onSelectInstance?.(instance);
  };

  const instanceToDeleteName = instances.find(
    (i) => i.id === instanceToDelete,
  )?.name;

  if (isLoading && instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Spinner className="h-8 w-8" />
        <p className="text-muted-foreground">Loading instances...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full">
      {/* Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {instances.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4 rounded-lg border-2 border-dashed border-border h-full relative">
          <img
            src="/img/building-claw.png"
            alt="No instances"
            className="h-3/5"
          />
          <div className="text-center space-y-2">
            <h3 className="font-semibold">No instances yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create your first OpenClaw instance to get started with managing
              your messaging integrations.
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create First Instance
          </Button>
        </div>
      )}

      {/* Instance grid */}
      {instances.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              clawpitDir={clawpitDir}
              isActive={instance.id === activeInstanceId}
              onSelect={() => handleInstanceClick(instance)}
              onStart={() => startInstance(instance.id)}
              onStop={() => stopInstance(instance.id)}
              onRestart={() => restartInstance(instance.id)}
              onEdit={() => handleEditInstance(instance.id)}
              onDelete={() => handleDeleteClick(instance.id)}
              onViewLogs={() => handleViewLogs(instance)}
              onPullUpdates={
                isPullingUpdates === instance.id
                  ? undefined
                  : () => handlePullUpdates(instance.id)
              }
              onOpenTerminal={() => handleOpenTerminal(instance)}
            />
          ))}
        </div>
      )}

      {/* Create instance dialog */}
      <CreateInstanceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateInstance}
        clawpitDir={clawpitDir}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Instance</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{instanceToDeleteName}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="my-4">
            <AlertCircle className="h-4 w-4" />
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
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Instance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log viewer dialog */}
      <Dialog
        open={logViewerInstance !== null}
        onOpenChange={(open) => !open && setLogViewerInstance(null)}
      >
        <DialogContent className="max-w-4xl h-[80vh]">
          {logViewerInstance && (
            <LogViewer
              instanceId={logViewerInstance.id}
              instanceName={logViewerInstance.name}
              onClose={() => setLogViewerInstance(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
