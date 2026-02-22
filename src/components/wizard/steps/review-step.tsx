import { useEffect } from 'react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useConfigStore, useWizardStore } from '@/stores';

export function ReviewStep() {
  const { data, markStepComplete } = useWizardStore();
  const { platform } = useConfigStore();
  const { instance } = data;

  // Mark step as complete on mount
  useEffect(() => {
    markStepComplete('review');
  }, [markStepComplete]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">Review Configuration</h2>
        <p className="text-muted-foreground mt-1">
          Please review your settings before starting the installation.
        </p>
      </div>

      {/* Platform Info */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Platform</span>
            <Badge variant="outline" className="capitalize">
              {platform}
            </Badge>
          </div>
          {platform === 'windows' && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">
                WSL Distribution
              </span>
              <span className="text-sm font-mono">{data.wslDistro}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Directory Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>📁</span> Directory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <ReviewItem label="Clawpit Root" value={data.clawpitDir} mono />
            <ReviewItem
              label="Instance Path"
              value={`${data.clawpitDir}/instances/${instance.id}`}
              mono
            />
          </div>
        </CardContent>
      </Card>

      {/* Instance Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>🔧</span> Instance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <ReviewItem label="ID" value={instance.id} mono />
            <ReviewItem label="Name" value={instance.name} />
            {instance.description && (
              <ReviewItem label="Description" value={instance.description} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Network Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>🌐</span> Network
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <ReviewItem
              label="Gateway Port"
              value={instance.gatewayPort.toString()}
              mono
            />
            <ReviewItem
              label="Bridge Port"
              value={instance.bridgePort.toString()}
              mono
            />
            <ReviewItem
              label="Binding Mode"
              value={
                instance.bindMode === 'local'
                  ? 'Local Only (127.0.0.1)'
                  : 'LAN Access (0.0.0.0)'
              }
            />
            <ReviewItem
              label="Gateway URL"
              value={`http://${
                instance.bindMode === 'local' ? 'localhost' : '0.0.0.0'
              }:${instance.gatewayPort}`}
              mono
            />
          </div>
        </CardContent>
      </Card>

      {/* Authentication */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>🔐</span> Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <ReviewItem
              label="Token"
              value={
                instance.authToken
                  ? `${instance.authToken.substring(0, 8)}...${instance.authToken.substring(
                      instance.authToken.length - 4,
                    )}`
                  : 'Not set'
              }
              mono
            />
            <ReviewItem
              label="Token Type"
              value={instance.tokenGenerated ? 'Auto-generated' : 'Custom'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Providers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>💬</span> Providers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {instance.providers.whatsapp && (
              <Badge variant="secondary">
                <span className="mr-1">📱</span> WhatsApp
              </Badge>
            )}
            {instance.providers.telegram.enabled && (
              <Badge variant="secondary">
                <span className="mr-1">✈️</span> Telegram
                {instance.providers.telegram.token && ' (token set)'}
              </Badge>
            )}
            {instance.providers.discord.enabled && (
              <Badge variant="secondary">
                <span className="mr-1">🎮</span> Discord
                {instance.providers.discord.token && ' (token set)'}
              </Badge>
            )}
            {!instance.providers.whatsapp &&
              !instance.providers.telegram.enabled &&
              !instance.providers.discord.enabled && (
                <span className="text-sm text-muted-foreground">
                  No providers configured
                </span>
              )}
          </div>
        </CardContent>
      </Card>

      {/* Installation Summary */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
        <div className="flex gap-3">
          <span className="text-primary">ℹ️</span>
          <div className="text-sm">
            <p className="font-medium text-primary">Ready to Install</p>
            <p className="text-muted-foreground mt-1">
              Clicking <strong>Start Installation</strong> will:
            </p>
            <ul className="text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Create the directory structure</li>
              <li>Generate configuration files</li>
              <li>Pull the OpenClaw Docker image</li>
              <li>Configure and start the gateway service</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default ReviewStep;
