import { useEffect } from 'react';
import { PrerequisitesChecker } from '@/components';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui';
import { useStatusStore, useWizardStore } from '@/stores';

export function PrerequisitesStep() {
  const { prerequisites } = useStatusStore();
  const { markStepComplete } = useWizardStore();

  // Mark step as complete when all prerequisites pass
  useEffect(() => {
    if (prerequisites?.allPassed) {
      markStepComplete('prerequisites');
    }
  }, [prerequisites?.allPassed, markStepComplete]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">System Requirements</h2>
        <p className="text-muted-foreground mt-1">
          Let's verify your system has everything needed to run OpenClaw.
        </p>
      </div>

      {/* Prerequisites Checker */}
      <PrerequisitesChecker
        showHeader={false}
        onAllPassed={() => markStepComplete('prerequisites')}
      />

      {/* Help text */}
      {prerequisites && !prerequisites.allPassed && (
        <Alert>
          <AlertTitle>Need Help?</AlertTitle>
          <AlertDescription>
            Click the "Fix" button next to any failed requirement to see
            installation instructions. You can also use the setup wizards from
            the main app to install missing dependencies.
          </AlertDescription>
        </Alert>
      )}

      {/* Success message */}
      {prerequisites?.allPassed && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-4">
          <div className="flex gap-3">
            <span className="text-success text-xl">✓</span>
            <div>
              <p className="font-medium text-success">All Requirements Met</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your system is ready. Click <strong>Next</strong> to continue
                with the setup.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PrerequisitesStep;
