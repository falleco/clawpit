import { ArrowLeft } from 'lucide-react';
import { PrerequisitesChecker } from '@/components';
import { Button } from '@/components/ui';

interface PrerequisitesScreenProps {
  platform: 'windows' | 'macos' | 'linux' | null;
  prerequisitesPassed: boolean;
  onBack: () => void;
  onAllPassed: () => void;
  onOpenWslWizard: () => void;
  onOpenDockerWizard: () => void;
  onOpenInstallationGuide: () => void;
  onContinueToSetup: () => void;
}

export function PrerequisitesScreen({
  platform,
  prerequisitesPassed,
  onBack,
  onAllPassed,
  onOpenWslWizard,
  onOpenDockerWizard,
  onOpenInstallationGuide,
  onContinueToSetup,
}: PrerequisitesScreenProps) {
  return (
    <div className="mx-auto space-y-6">
      <div className="mb-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h2 className="text-lg font-semibold">System Requirements</h2>
      </div>

      <PrerequisitesChecker
        onAllPassed={onAllPassed}
        showHeader={true}
        onOpenWslWizard={platform === 'windows' ? onOpenWslWizard : undefined}
        onOpenDockerWizard={onOpenDockerWizard}
        onOpenInstallationGuide={onOpenInstallationGuide}
      />

      {prerequisitesPassed && (
        <div className="flex justify-end">
          <Button onClick={onContinueToSetup}>Continue to Setup →</Button>
        </div>
      )}
    </div>
  );
}
