import { Badge } from '@/components/ui';
import { useConfigStore } from '@/stores';

export function WelcomeStep() {
  const { platform } = useConfigStore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <span className="text-3xl">🦀</span>
        </div>
        <h2 className="text-2xl font-bold">Welcome to Clawpit</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your desktop companion for managing OpenClaw. This setup wizard will
          guide you through the configuration process.
        </p>
      </div>

      {/* Platform Badge */}
      {platform && (
        <div className="flex justify-center">
          <Badge variant="outline" className="capitalize">
            Detected: {platform}
          </Badge>
        </div>
      )}

      {/* What we'll do */}
      <div className="bg-muted/50 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold">What we'll set up:</h3>
        <ul className="space-y-3">
          <SetupItem
            icon="✓"
            title="Check Prerequisites"
            description="Verify Docker and other requirements"
          />
          <SetupItem
            icon="🔧"
            title="Create Instance"
            description="Configure your first OpenClaw instance"
          />
          <SetupItem
            icon="🌐"
            title="Network Settings"
            description="Configure ports and network binding"
          />
          <SetupItem
            icon="🔐"
            title="Authentication"
            description="Set up secure access tokens"
          />
          <SetupItem
            icon="💬"
            title="Messaging (Optional)"
            description="Configure WhatsApp, Telegram, or Discord"
          />
        </ul>
      </div>

      {/* Platform-specific note */}
      {platform === 'windows' && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex gap-3">
            <span className="text-blue-500">ℹ️</span>
            <div className="text-sm">
              <p className="font-medium text-blue-500">Windows Users</p>
              <p className="text-muted-foreground mt-1">
                OpenClaw runs inside WSL2 (Windows Subsystem for Linux). We'll
                check that WSL2 is properly configured during the prerequisites
                step.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Time estimate */}
      <p className="text-center text-sm text-muted-foreground">
        Click <strong>Next</strong> to begin the setup process.
      </p>
    </div>
  );
}

function SetupItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm">
        {icon}
      </span>
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}

export default WelcomeStep;
