import { useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';

interface FeatureTourProps {
  open: boolean;
  onSkip: () => void;
  onComplete: () => void;
}

interface FeatureStep {
  title: string;
  description: string;
}

export function FeatureTour({ open, onSkip, onComplete }: FeatureTourProps) {
  const steps = useMemo<FeatureStep[]>(
    () => [
      {
        title: 'Guided setup first',
        description:
          'Start in System Requirements to validate Docker, Git, and platform dependencies.',
      },
      {
        title: 'Manage instances safely',
        description:
          'Use Dashboard and Settings to control instances, monitor health, and troubleshoot quickly.',
      },
      {
        title: 'Deploy with templates',
        description:
          'Templates provide pre-configured teams of AI agents for common workflows like product engineering, copywriting, and more.',
      },
    ],
    [],
  );

  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLastStep = index === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setIndex((current) => current + 1);
  };

  const handleBack = () => {
    setIndex((current) => Math.max(0, current - 1));
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onSkip()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          {steps.map((item, stepIndex) => (
            <div
              key={item.title}
              className={`h-2 flex-1 rounded-full ${
                stepIndex <= index ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="ghost" onClick={onSkip}>
              Skip tour
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={index === 0}
              >
                Back
              </Button>
              <Button onClick={handleNext}>
                {isLastStep ? 'Finish' : 'Next'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FeatureTour;
