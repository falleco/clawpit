import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useConfigStore, useWizardStore } from '@/stores';

interface CompleteStepProps {
  onComplete?: () => void;
}

export function CompleteStep({ onComplete }: CompleteStepProps) {
  const { data, reset } = useWizardStore();
  const { platform } = useConfigStore();
  const { instance } = data;

  // Build gateway URL with auth token
  const gatewayUrl = instance.authToken
    ? `http://localhost:${instance.gatewayPort}?token=${encodeURIComponent(instance.authToken)}`
    : `http://localhost:${instance.gatewayPort}`;

  // Open gateway in browser using Tauri opener
  const handleOpenGateway = async () => {
    try {
      await openUrl(gatewayUrl);
    } catch (error) {
      console.error('Failed to open gateway URL:', error);
    }
  };

  // Start new setup
  const handleStartNew = () => {
    reset();
  };

  // Go to dashboard
  const handleGoToDashboard = () => {
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/10">
          <span className="text-5xl">🎉</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-success">Setup Complete!</h2>
          <p className="text-muted-foreground mt-2">
            Your OpenClaw instance "{instance.name}" is ready to use.
          </p>
        </div>
      </div>

      {/* Instance Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>🔧</span> Instance Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium">{instance.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">ID</span>
            <code className="text-sm">{instance.id}</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="outline" className="text-success border-success">
              Running
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Access */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>🔗</span> Quick Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Gateway API</p>
              <code className="text-xs text-muted-foreground break-all">
                {gatewayUrl}
              </code>
            </div>
            <Button size="sm" variant="outline" onClick={handleOpenGateway}>
              Open
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Bridge Service</p>
              <code className="text-xs text-muted-foreground">
                http://localhost:{instance.bridgePort}
              </code>
            </div>
            <Badge variant="secondary">Active</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Provider Status */}
      {(instance.providers.whatsapp ||
        instance.providers.telegram.enabled ||
        instance.providers.discord.enabled) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span>💬</span> Configured Providers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {instance.providers.whatsapp && (
                <Badge variant="secondary">
                  <span className="mr-1">📱</span> WhatsApp
                  <span className="ml-1 text-warning">(scan QR)</span>
                </Badge>
              )}
              {instance.providers.telegram.enabled && (
                <Badge variant="secondary">
                  <span className="mr-1">✈️</span> Telegram
                </Badge>
              )}
              {instance.providers.discord.enabled && (
                <Badge variant="secondary">
                  <span className="mr-1">🎮</span> Discord
                </Badge>
              )}
            </div>
            {instance.providers.whatsapp && (
              <p className="text-xs text-muted-foreground mt-3">
                WhatsApp requires scanning a QR code. Access the web interface
                to complete the connection.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>📋</span> Next Steps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">1.</span>
              <span>
                Open the gateway web interface to access the OpenClaw dashboard
              </span>
            </li>
            {instance.providers.whatsapp && (
              <li className="flex items-start gap-2">
                <span className="text-primary">2.</span>
                <span>Scan the WhatsApp QR code to connect your account</span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <span className="text-primary">
                {instance.providers.whatsapp ? '3.' : '2.'}
              </span>
              <span>
                Use the Clawpit dashboard to monitor and manage your instance
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button onClick={handleGoToDashboard} size="lg" className="w-full">
          Go to Dashboard
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleOpenGateway}
            className="flex-1"
          >
            Open Web Interface
          </Button>
          <Button variant="ghost" onClick={handleStartNew} className="flex-1">
            Create Another Instance
          </Button>
        </div>
      </div>

      {/* Platform-specific note */}
      {platform === 'windows' && (
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Tip:</strong> Your instance is running in WSL2. You can
            access it from Windows at the URLs shown above, or from within WSL
            using the same ports.
          </p>
        </div>
      )}
    </div>
  );
}

export default CompleteStep;
