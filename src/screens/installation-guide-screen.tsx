import { ArrowLeft } from 'lucide-react';
import { InstallationGuide } from '@/components';
import { Button } from '@/components/ui';

interface InstallationGuideScreenProps {
  onBack: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

export function InstallationGuideScreen({
  onBack,
  onComplete,
  onCancel,
}: InstallationGuideScreenProps) {
  return (
    <div className="mx-auto space-y-6">
      <div className="mb-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h2 className="text-lg font-semibold">Installation Guide</h2>
      </div>

      <InstallationGuide onComplete={onComplete} onCancel={onCancel} />
    </div>
  );
}
