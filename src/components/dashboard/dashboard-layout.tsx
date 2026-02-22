import { useEffect, useRef } from 'react';
import { type ClawpitInstance, useInstanceStore } from '@/stores';
import { InstanceDetail } from '../instances/instance-detail';
import { InstanceManager } from '../instances/instance-manager';

interface DashboardLayoutProps {
  clawpitDir: string;
  onNavigateSettings?: () => void;
  selectedInstance: ClawpitInstance | null;
  onInstanceSelect: (instance: ClawpitInstance | null) => void;
  onOpenTerminal?: (instance: ClawpitInstance) => void;
}

export function DashboardLayout({
  clawpitDir,
  onNavigateSettings,
  selectedInstance,
  onInstanceSelect,
  onOpenTerminal,
}: DashboardLayoutProps) {
  const { instances, loadInstances, refreshInstanceStatus, setClawpitDir } =
    useInstanceStore();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep the selected instance in sync with the store (in case it was updated)
  const currentInstance = selectedInstance
    ? (instances.find((i) => i.id === selectedInstance.id) ?? null)
    : null;

  const handleBack = () => {
    onInstanceSelect(null);
  };

  // Set clawpitDir and load instances on mount
  useEffect(() => {
    if (clawpitDir) {
      setClawpitDir(clawpitDir);
      loadInstances();
    }
  }, [clawpitDir, setClawpitDir, loadInstances]);

  // Start polling for instance status updates
  useEffect(() => {
    if (!clawpitDir || instances.length === 0) return;

    // Poll every 10 seconds
    const pollStatus = async () => {
      for (const instance of instances) {
        await refreshInstanceStatus(instance.id);
      }
    };

    // Initial poll
    pollStatus();

    // Set up interval
    pollIntervalRef.current = setInterval(pollStatus, 10000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [clawpitDir, instances.length, refreshInstanceStatus, instances]);

  // Show detail view if an instance is selected
  if (currentInstance) {
    return (
      <div className="h-full">
        <InstanceDetail
          instance={currentInstance}
          clawpitDir={clawpitDir}
          onBack={handleBack}
          onOpenSettings={onNavigateSettings}
          onOpenTerminal={onOpenTerminal}
        />
      </div>
    );
  }

  // Show instance list
  return (
    <div className="h-full">
      <InstanceManager
        clawpitDir={clawpitDir}
        onOpenSettings={onNavigateSettings}
        onSelectInstance={onInstanceSelect}
        onOpenTerminal={onOpenTerminal}
      />
    </div>
  );
}

export default DashboardLayout;
