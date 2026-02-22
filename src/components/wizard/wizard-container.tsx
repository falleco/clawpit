import { useCallback, useEffect } from 'react';
import { Button, Card, CardContent, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';
import { STEP_META, STEP_ORDER, useWizardStore, WizardStep } from '@/stores';
import { AuthStep } from './steps/auth-step';
import { CompleteStep } from './steps/complete-step';
import { InstallStep } from './steps/install-step';
import { InstanceStep } from './steps/instance-step';
import { ModelsStep } from './steps/models-step';
import { NetworkStep } from './steps/network-step';
import { PrerequisitesStep } from './steps/prerequisites-step';
import { ProvidersStep } from './steps/providers-step';
import { ReviewStep } from './steps/review-step';
// Step Components
import { WelcomeStep } from './steps/welcome-step';

interface WizardContainerProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function WizardContainer({
  onComplete,
  onCancel,
}: WizardContainerProps) {
  const {
    currentStep,
    completedSteps,
    skippedSteps,
    nextStep,
    prevStep,
    skipStep,
    canGoNext,
    canGoPrev,
    canSkip,
    getStepIndex,
    getTotalSteps,
    isInstalling,
  } = useWizardStore();

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (canGoNext() && !isInstalling) {
          e.preventDefault();
          nextStep();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        if (canGoPrev()) {
          e.preventDefault();
          prevStep();
        }
      } else if (e.key === 'Escape') {
        if (onCancel && currentStep === 'welcome') {
          onCancel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canGoNext,
    canGoPrev,
    nextStep,
    prevStep,
    onCancel,
    currentStep,
    isInstalling,
  ]);

  // Render step content
  const renderStepContent = useCallback(() => {
    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep />;
      case 'prerequisites':
        return <PrerequisitesStep />;
      case 'instance':
        return <InstanceStep />;
      case 'network':
        return <NetworkStep />;
      case 'auth':
        return <AuthStep />;
      case 'models':
        return <ModelsStep />;
      case 'providers':
        return <ProvidersStep />;
      case 'review':
        return <ReviewStep />;
      case 'install':
        return <InstallStep />;
      case 'complete':
        return <CompleteStep onComplete={onComplete} />;
      default:
        return null;
    }
  }, [currentStep, onComplete]);

  // Get step status
  const getStepStatus = (
    step: WizardStep,
  ): 'completed' | 'current' | 'upcoming' | 'skipped' => {
    if (completedSteps.includes(step)) return 'completed';
    if (skippedSteps.includes(step)) return 'skipped';
    if (step === currentStep) return 'current';
    return 'upcoming';
  };

  // Calculate progress percentage
  const progressPercent = Math.round(
    (getStepIndex() / (getTotalSteps() - 1)) * 100,
  );

  // Steps to show in the indicator (exclude install and complete for cleaner UI)
  const visibleSteps = STEP_ORDER.filter(
    (step) => step !== 'install' && step !== 'complete',
  );

  return (
    <div className="flex flex-col h-full">
      {/* Step Indicator */}
      <div className="mb-6">
        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>
              Step {getStepIndex() + 1} of {getTotalSteps()}
            </span>
            <span>{progressPercent}% complete</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
          {visibleSteps.map((step, index) => {
            const status = getStepStatus(step);
            const meta = STEP_META[step];
            const isClickable = status === 'completed' || status === 'skipped';

            return (
              <button
                type="button"
                key={step}
                onClick={() => {
                  if (isClickable) {
                    useWizardStore.getState().setStep(step);
                  }
                }}
                disabled={!isClickable}
                className={cn(
                  'flex flex-col items-center gap-1 min-w-[60px] p-2 rounded-md transition-colors',
                  status === 'current' && 'bg-primary/10',
                  status === 'completed' && 'cursor-pointer hover:bg-muted',
                  status === 'skipped' &&
                    'cursor-pointer hover:bg-muted opacity-60',
                  status === 'upcoming' && 'opacity-40 cursor-not-allowed',
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors',
                    status === 'current' &&
                      'border-primary bg-primary text-primary-foreground',
                    status === 'completed' &&
                      'border-success bg-success/10 text-success',
                    status === 'skipped' &&
                      'border-muted-foreground bg-muted text-muted-foreground',
                    status === 'upcoming' &&
                      'border-muted bg-background text-muted-foreground',
                  )}
                >
                  {status === 'completed' ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : status === 'skipped' ? (
                    <SkipIcon className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs font-medium truncate max-w-[60px]',
                    status === 'current' && 'text-foreground',
                    status !== 'current' && 'text-muted-foreground',
                  )}
                >
                  {meta.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-6 h-full overflow-y-auto">
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation */}
      {currentStep !== 'complete' && (
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-2">
            {onCancel && currentStep === 'welcome' && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {canGoPrev() && (
              <Button variant="outline" onClick={prevStep}>
                <ChevronLeftIcon className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canSkip() && (
              <Button variant="ghost" onClick={skipStep}>
                Skip
              </Button>
            )}
            {currentStep !== 'install' && canGoNext() && (
              <Button onClick={nextStep}>
                {currentStep === 'review' ? 'Start Installation' : 'Next'}
                <ChevronRightIcon className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SkipIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 5l7 7-7 7M5 5l7 7-7 7"
      />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default WizardContainer;
