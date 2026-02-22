import { Play } from 'lucide-react';
import {
  CoreServicesMonitor,
  StatusOverview,
} from '@/components/dashboard';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import type { ClawpitInstance } from '@/stores';

interface HomeScreenProps {
  clawpitDir: string | null;
  instances: ClawpitInstance[];
  prerequisitesPassed: boolean;
  setupCompleted: boolean;
  onOpenPrerequisites: () => void;
  onStartSetupWizard: () => void;
  onOpenDashboard: () => void;
}

export function HomeScreen({
  clawpitDir,
  instances,
  prerequisitesPassed,
  setupCompleted,
  onOpenPrerequisites,
  onStartSetupWizard,
  onOpenDashboard,
}: HomeScreenProps) {
  return (
    <div className="mx-auto space-y-6">
      {setupCompleted && clawpitDir && (
        <>
          <StatusOverview instances={instances} />
          <CoreServicesMonitor clawpitDir={clawpitDir} compact />
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Welcome to Clawpit</CardTitle>
          <CardDescription>
            Your desktop companion for managing OpenClaw. This setup wizard will
            help you configure everything you need to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${
                prerequisitesPassed ? 'bg-success' : 'bg-muted'
              }`}
            />
            <span className="text-sm">
              {prerequisitesPassed
                ? 'System ready for installation'
                : 'Check system requirements to begin'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={onOpenPrerequisites}
            variant={prerequisitesPassed ? 'outline' : 'default'}
            className="w-full justify-start"
          >
            <span className="mr-2">{prerequisitesPassed ? '✓' : '1.'}</span>
            Check System Requirements
          </Button>
          <Button
            onClick={onStartSetupWizard}
            disabled={!prerequisitesPassed}
            className="w-full justify-start"
            variant={setupCompleted ? 'outline' : 'default'}
          >
            <span className="mr-2">{setupCompleted ? '✓' : '2.'}</span>
            {setupCompleted ? 'Run Setup Wizard Again' : 'Configure OpenClaw'}
          </Button>
          {setupCompleted && clawpitDir && (
            <Button
              onClick={onOpenDashboard}
              className="w-full justify-start"
              variant="default"
            >
              <Play className="mr-2 h-4 w-4" />
              Open Instances
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
