import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { useWizardStore } from '@/stores';

export function InstanceStep() {
  const { data, updateInstance, markStepComplete } = useWizardStore();
  const { instance } = data;

  const [idError, setIdError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Validate instance configuration
  useEffect(() => {
    const isValid =
      instance.id.length >= 3 &&
      instance.id.length <= 32 &&
      /^[a-z][a-z0-9_-]*$/.test(instance.id) &&
      instance.name.length >= 1 &&
      instance.name.length <= 50;

    if (isValid) {
      markStepComplete('instance');
    }
  }, [instance.id, instance.name, markStepComplete]);

  // Validate ID format
  const validateId = (id: string) => {
    if (id.length === 0) {
      setIdError('Instance ID is required');
      return;
    }
    if (id.length < 3) {
      setIdError('ID must be at least 3 characters');
      return;
    }
    if (id.length > 32) {
      setIdError('ID must be 32 characters or less');
      return;
    }
    if (!/^[a-z]/.test(id)) {
      setIdError('ID must start with a lowercase letter');
      return;
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
      setIdError(
        'ID can only contain lowercase letters, numbers, hyphens, and underscores',
      );
      return;
    }
    if (['_template', '_backup'].includes(id)) {
      setIdError('This ID is reserved');
      return;
    }
    setIdError(null);
  };

  // Validate name
  const validateName = (name: string) => {
    if (name.length === 0) {
      setNameError('Display name is required');
      return;
    }
    if (name.length > 50) {
      setNameError('Name must be 50 characters or less');
      return;
    }
    setNameError(null);
  };

  // Handle ID change
  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    updateInstance({ id: value });
    validateId(value);
  };

  // Handle name change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    updateInstance({ name: value });
    validateName(value);
  };

  // Handle description change
  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    updateInstance({ description: e.target.value });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">Create Instance</h2>
        <p className="text-muted-foreground mt-1">
          Configure your first OpenClaw instance. You can create additional
          instances later from the dashboard.
        </p>
      </div>

      {/* Instance Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Instance Details</CardTitle>
          <CardDescription>
            Each instance runs independently with its own configuration and
            data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Instance ID */}
          <div className="space-y-2">
            <Label htmlFor="instance-id">
              Instance ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="instance-id"
              value={instance.id}
              onChange={handleIdChange}
              placeholder="my-instance"
              className={cn('font-mono', idError && 'border-destructive')}
            />
            {idError ? (
              <p className="text-xs text-destructive">{idError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, hyphens, and underscores only. Used
                as the folder name.
              </p>
            )}
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="instance-name">
              Display Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="instance-name"
              value={instance.name}
              onChange={handleNameChange}
              placeholder="My Instance"
              className={cn(nameError && 'border-destructive')}
            />
            {nameError ? (
              <p className="text-xs text-destructive">{nameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                A friendly name shown in the dashboard.
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="instance-description">
              Description{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="instance-description"
              value={instance.description}
              onChange={handleDescriptionChange}
              placeholder="What will this instance be used for?"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Instance Path Preview */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <h4 className="text-sm font-medium mb-2">Instance Location</h4>
          <code className="text-xs text-muted-foreground block bg-background p-2 rounded">
            {data.clawpitDir}/instances/{instance.id || '<instance-id>'}/
          </code>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <div className="flex gap-3">
          <span className="text-blue-500">ℹ️</span>
          <div className="text-sm">
            <p className="font-medium text-blue-500">About Instances</p>
            <p className="text-muted-foreground mt-1">
              Instances are isolated OpenClaw environments. Each instance has
              its own ports, authentication tokens, and provider configurations.
              You can run multiple instances simultaneously for different use
              cases (e.g., work, personal, testing).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InstanceStep;
