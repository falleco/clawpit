import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Gamepad2,
  MessageCircle,
  Send,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { useWizardStore } from '@/stores';

interface TokenValidation {
  valid: boolean;
  message: string;
}

// Telegram bot token format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
function validateTelegramToken(token: string): TokenValidation {
  if (!token) {
    return { valid: false, message: 'Token is required' };
  }

  const telegramRegex = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;
  if (!telegramRegex.test(token)) {
    if (!token.includes(':')) {
      return { valid: false, message: 'Token should contain a colon (:)' };
    }
    const [botId, hash] = token.split(':');
    if (!/^\d+$/.test(botId)) {
      return {
        valid: false,
        message: 'Bot ID (before colon) should be numeric',
      };
    }
    if (hash && hash.length < 30) {
      return { valid: false, message: 'Token hash appears too short' };
    }
    return { valid: false, message: 'Invalid token format' };
  }

  return { valid: true, message: 'Token format looks valid' };
}

// Discord bot token format: base64-encoded, typically 59-72 characters
function validateDiscordToken(token: string): TokenValidation {
  if (!token) {
    return { valid: false, message: 'Token is required' };
  }

  // Discord tokens are typically base64-encoded and have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    return {
      valid: false,
      message: 'Token should have 3 parts separated by dots',
    };
  }

  if (token.length < 50) {
    return { valid: false, message: 'Token appears too short' };
  }

  if (token.length > 100) {
    return { valid: false, message: 'Token appears too long' };
  }

  // Basic base64 character check
  const base64Regex = /^[A-Za-z0-9_-]+$/;
  for (const part of parts) {
    if (!base64Regex.test(part)) {
      return { valid: false, message: 'Token contains invalid characters' };
    }
  }

  return { valid: true, message: 'Token format looks valid' };
}

export function ProvidersStep() {
  const { data, updateInstance, markStepComplete } = useWizardStore();
  const { instance } = data;
  const { providers } = instance;

  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [showDiscordToken, setShowDiscordToken] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  // Token validation states
  const telegramValidation = providers.telegram.enabled
    ? validateTelegramToken(providers.telegram.token)
    : { valid: true, message: '' };

  const discordValidation = providers.discord.enabled
    ? validateDiscordToken(providers.discord.token)
    : { valid: true, message: '' };

  // This step is optional, so mark it complete on mount
  // But warn if tokens are enabled without valid tokens
  useEffect(() => {
    markStepComplete('providers');
  }, [markStepComplete]);

  // Toggle provider
  const toggleProvider = (provider: 'whatsapp' | 'telegram' | 'discord') => {
    if (provider === 'whatsapp') {
      updateInstance({
        providers: { ...providers, whatsapp: !providers.whatsapp },
      });
    } else if (provider === 'telegram') {
      updateInstance({
        providers: {
          ...providers,
          telegram: {
            ...providers.telegram,
            enabled: !providers.telegram.enabled,
          },
        },
      });
    } else if (provider === 'discord') {
      updateInstance({
        providers: {
          ...providers,
          discord: {
            ...providers.discord,
            enabled: !providers.discord.enabled,
          },
        },
      });
    }
  };

  // Update provider token
  const updateProviderToken = (
    provider: 'telegram' | 'discord',
    token: string,
  ) => {
    updateInstance({
      providers: {
        ...providers,
        [provider]: { ...providers[provider], token },
      },
    });
  };

  // Count enabled providers
  const enabledCount = [
    providers.whatsapp,
    providers.telegram.enabled,
    providers.discord.enabled,
  ].filter(Boolean).length;

  // Check if there are validation issues
  const hasValidationIssues =
    (providers.telegram.enabled && !telegramValidation.valid) ||
    (providers.discord.enabled && !discordValidation.valid);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">Messaging Providers</h2>
        <p className="text-muted-foreground mt-1">
          Configure messaging providers for your OpenClaw instance. This step is
          optional - you can configure providers later from the dashboard.
        </p>
      </div>

      {/* Skip Notice */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>This step is optional.</strong> You can skip provider
          configuration and set them up later. Select only the providers you
          want to use.
        </AlertDescription>
      </Alert>

      {/* WhatsApp */}
      <Card className={cn(providers.whatsapp && 'border-green-500/50')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  WhatsApp
                  <Badge variant="outline" className="text-xs font-normal">
                    QR Code
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Connect via WhatsApp Web protocol
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={providers.whatsapp}
              onCheckedChange={() => toggleProvider('whatsapp')}
            />
          </div>
        </CardHeader>
        {providers.whatsapp && (
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-green-600">Ready to connect</p>
                <p className="text-muted-foreground mt-1">
                  After installation, you'll scan a QR code with your phone to
                  link WhatsApp. No additional configuration needed now.
                </p>
              </div>
            </div>

            {/* Setup guide toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between"
              onClick={() =>
                setExpandedGuide(
                  expandedGuide === 'whatsapp' ? null : 'whatsapp',
                )
              }
            >
              <span>How to connect WhatsApp</span>
              {expandedGuide === 'whatsapp' ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {expandedGuide === 'whatsapp' && (
              <div className="text-sm text-muted-foreground space-y-2 pl-4 border-l-2 border-muted">
                <p>
                  <strong>1.</strong> Start your OpenClaw instance
                </p>
                <p>
                  <strong>2.</strong> Open the WhatsApp provider in the
                  dashboard
                </p>
                <p>
                  <strong>3.</strong> A QR code will appear on screen
                </p>
                <p>
                  <strong>4.</strong> Open WhatsApp on your phone → Settings →
                  Linked Devices
                </p>
                <p>
                  <strong>5.</strong> Tap "Link a Device" and scan the QR code
                </p>
                <p>
                  <strong>6.</strong> Wait for connection confirmation
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Telegram */}
      <Card className={cn(providers.telegram.enabled && 'border-blue-500/50')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Telegram
                  <Badge variant="outline" className="text-xs font-normal">
                    Bot Token
                  </Badge>
                </CardTitle>
                <CardDescription>Connect via Telegram Bot API</CardDescription>
              </div>
            </div>
            <Switch
              checked={providers.telegram.enabled}
              onCheckedChange={() => toggleProvider('telegram')}
            />
          </div>
        </CardHeader>
        {providers.telegram.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="telegram-token">Bot Token</Label>
                {providers.telegram.token && (
                  <div className="flex items-center gap-1">
                    {telegramValidation.valid ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span
                      className={cn(
                        'text-xs',
                        telegramValidation.valid
                          ? 'text-success'
                          : 'text-destructive',
                      )}
                    >
                      {telegramValidation.message}
                    </span>
                  </div>
                )}
              </div>
              <div className="relative">
                <Input
                  id="telegram-token"
                  type={showTelegramToken ? 'text' : 'password'}
                  value={providers.telegram.token}
                  onChange={(e) =>
                    updateProviderToken('telegram', e.target.value)
                  }
                  placeholder="123456789:ABCdefGHI..."
                  className={cn(
                    'font-mono text-sm pr-10',
                    providers.telegram.token &&
                      !telegramValidation.valid &&
                      'border-destructive',
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowTelegramToken(!showTelegramToken)}
                >
                  {showTelegramToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Setup guide toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between"
              onClick={() =>
                setExpandedGuide(
                  expandedGuide === 'telegram' ? null : 'telegram',
                )
              }
            >
              <span>How to get a Telegram bot token</span>
              {expandedGuide === 'telegram' ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {expandedGuide === 'telegram' && (
              <div className="text-sm text-muted-foreground space-y-2 pl-4 border-l-2 border-muted">
                <p>
                  <strong>1.</strong> Open Telegram and search for @BotFather
                </p>
                <p>
                  <strong>2.</strong> Start a chat and send{' '}
                  <code className="bg-muted px-1 rounded">/newbot</code>
                </p>
                <p>
                  <strong>3.</strong> Follow the prompts to name your bot
                </p>
                <p>
                  <strong>4.</strong> BotFather will send you a token like:
                </p>
                <code className="block bg-muted p-2 rounded text-xs">
                  123456789:ABCdefGHIjklMNOpqrsTUVwxyz
                </code>
                <p>
                  <strong>5.</strong> Copy and paste the token above
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Open @BotFather
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://core.telegram.org/bots#how-do-i-create-a-bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:underline flex items-center gap-1"
              >
                Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Discord */}
      <Card className={cn(providers.discord.enabled && 'border-indigo-500/50')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Gamepad2 className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Discord
                  <Badge variant="outline" className="text-xs font-normal">
                    Bot Token
                  </Badge>
                </CardTitle>
                <CardDescription>Connect via Discord Bot API</CardDescription>
              </div>
            </div>
            <Switch
              checked={providers.discord.enabled}
              onCheckedChange={() => toggleProvider('discord')}
            />
          </div>
        </CardHeader>
        {providers.discord.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="discord-token">Bot Token</Label>
                {providers.discord.token && (
                  <div className="flex items-center gap-1">
                    {discordValidation.valid ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span
                      className={cn(
                        'text-xs',
                        discordValidation.valid
                          ? 'text-success'
                          : 'text-destructive',
                      )}
                    >
                      {discordValidation.message}
                    </span>
                  </div>
                )}
              </div>
              <div className="relative">
                <Input
                  id="discord-token"
                  type={showDiscordToken ? 'text' : 'password'}
                  value={providers.discord.token}
                  onChange={(e) =>
                    updateProviderToken('discord', e.target.value)
                  }
                  placeholder="MTIz...xyz"
                  className={cn(
                    'font-mono text-sm pr-10',
                    providers.discord.token &&
                      !discordValidation.valid &&
                      'border-destructive',
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowDiscordToken(!showDiscordToken)}
                >
                  {showDiscordToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Setup guide toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between"
              onClick={() =>
                setExpandedGuide(expandedGuide === 'discord' ? null : 'discord')
              }
            >
              <span>How to get a Discord bot token</span>
              {expandedGuide === 'discord' ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {expandedGuide === 'discord' && (
              <div className="text-sm text-muted-foreground space-y-2 pl-4 border-l-2 border-muted">
                <p>
                  <strong>1.</strong> Go to the Discord Developer Portal
                </p>
                <p>
                  <strong>2.</strong> Click "New Application" and give it a name
                </p>
                <p>
                  <strong>3.</strong> Go to the "Bot" section in the left menu
                </p>
                <p>
                  <strong>4.</strong> Click "Add Bot" if you haven't already
                </p>
                <p>
                  <strong>5.</strong> Under "Token", click "Reset Token" or
                  "Copy"
                </p>
                <p>
                  <strong>6.</strong> Paste the token above
                </p>
                <p className="text-warning">
                  <strong>Note:</strong> Enable "Message Content Intent" in the
                  Bot settings if you need to read message content.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Developer Portal
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://discord.com/developers/docs/getting-started"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:underline flex items-center gap-1"
              >
                Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Validation warning */}
      {hasValidationIssues && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Some provider tokens appear to be invalid. Please check the token
            format or disable the provider if you don't have a token yet.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Configuration Summary</h4>
            <Badge variant={enabledCount > 0 ? 'default' : 'secondary'}>
              {enabledCount} provider{enabledCount !== 1 ? 's' : ''} enabled
            </Badge>
          </div>

          <div className="space-y-2">
            {/* WhatsApp */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-green-500" />
                <span>WhatsApp</span>
              </div>
              {providers.whatsapp ? (
                <Badge
                  variant="outline"
                  className="text-green-600 border-green-500/50"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Enabled
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Not configured
                </span>
              )}
            </div>

            {/* Telegram */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-blue-500" />
                <span>Telegram</span>
              </div>
              {providers.telegram.enabled ? (
                telegramValidation.valid || !providers.telegram.token ? (
                  <Badge
                    variant="outline"
                    className="text-blue-600 border-blue-500/50"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {providers.telegram.token ? 'Configured' : 'Enabled'}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-destructive border-destructive/50"
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Invalid token
                  </Badge>
                )
              ) : (
                <span className="text-muted-foreground text-xs">
                  Not configured
                </span>
              )}
            </div>

            {/* Discord */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-4 w-4 text-indigo-500" />
                <span>Discord</span>
              </div>
              {providers.discord.enabled ? (
                discordValidation.valid || !providers.discord.token ? (
                  <Badge
                    variant="outline"
                    className="text-indigo-600 border-indigo-500/50"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {providers.discord.token ? 'Configured' : 'Enabled'}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-destructive border-destructive/50"
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Invalid token
                  </Badge>
                )
              ) : (
                <span className="text-muted-foreground text-xs">
                  Not configured
                </span>
              )}
            </div>
          </div>

          {enabledCount === 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              You can configure providers later from the dashboard settings.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ProvidersStep;
