import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Shield,
  ShieldOff,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  Spinner,
  Switch,
} from '@/components/ui';
import { saveToken } from '@/lib/token-storage';
import { cn } from '@/lib/utils';
import { useWizardStore } from '@/stores';

type AuthMode = 'token' | 'none';

export function AuthStep() {
  const { data, updateInstance, markStepComplete } = useWizardStore();
  const { instance } = data;

  const [authMode, setAuthMode] = useState<AuthMode>(
    instance.authToken ? 'token' : 'none',
  );
  const [showToken, setShowToken] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Mark step complete based on auth mode
  useEffect(() => {
    if (authMode === 'none') {
      markStepComplete('auth');
    } else if (instance.authToken && instance.authToken.length >= 16) {
      markStepComplete('auth');
    }
  }, [authMode, instance.authToken, markStepComplete]);

  // Save token to secure storage when it changes
  const saveTokenToStorage = useCallback(
    async (token: string) => {
      if (!token || !instance.id) return;

      setSaving(true);
      setSaveError(null);

      try {
        await saveToken(instance.id, token);
      } catch (err) {
        console.error('Failed to save token to secure storage:', err);
        setSaveError(
          'Failed to save token securely. Token will still work but may not persist.',
        );
      } finally {
        setSaving(false);
      }
    },
    [instance.id],
  );

  // Generate secure token
  const handleGenerateToken = async () => {
    setGenerating(true);
    try {
      const token = await invoke<string>('generate_secure_token');
      updateInstance({ authToken: token, tokenGenerated: true });
      await saveTokenToStorage(token);
    } catch (err) {
      // Fallback to client-side generation
      console.warn('Server-side token generation failed, using fallback:', err);
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const token = Array.from(array, (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      updateInstance({ authToken: token, tokenGenerated: true });
      await saveTokenToStorage(token);
    } finally {
      setGenerating(false);
    }
  };

  // Copy token to clipboard
  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(instance.authToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy token:', err);
    }
  };

  // Handle manual token input
  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newToken = e.target.value;
    updateInstance({ authToken: newToken, tokenGenerated: false });
  };

  // Handle token blur - save when user finishes typing
  const handleTokenBlur = async () => {
    if (instance.authToken && instance.authToken.length >= 16) {
      await saveTokenToStorage(instance.authToken);
    }
  };

  // Handle auth mode change
  const handleAuthModeChange = (enabled: boolean) => {
    const newMode: AuthMode = enabled ? 'token' : 'none';
    setAuthMode(newMode);

    if (!enabled) {
      // Clear token when disabling auth
      updateInstance({ authToken: '', tokenGenerated: false });
    }
  };

  // Token strength indicator
  const getTokenStrength = (
    token: string,
  ): { level: string; color: string; score: number } => {
    if (token.length === 0)
      return { level: 'None', color: 'text-muted-foreground', score: 0 };
    if (token.length < 16)
      return { level: 'Weak', color: 'text-destructive', score: 1 };
    if (token.length < 32)
      return { level: 'Fair', color: 'text-warning', score: 2 };
    if (token.length < 64)
      return { level: 'Good', color: 'text-success', score: 3 };
    return { level: 'Strong', color: 'text-success', score: 4 };
  };

  const tokenStrength = getTokenStrength(instance.authToken);

  // Check if running in local mode (from network step)
  const isLocalOnly = instance.bindMode === 'local';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">Authentication</h2>
        <p className="text-muted-foreground mt-1">
          Configure security settings to protect access to your OpenClaw
          instance.
        </p>
      </div>

      {/* Auth Mode Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                {authMode === 'token' ? (
                  <Shield className="h-5 w-5 text-success" />
                ) : (
                  <ShieldOff className="h-5 w-5 text-muted-foreground" />
                )}
                Authentication
              </CardTitle>
              <CardDescription>
                {authMode === 'token'
                  ? 'Require a token to access the API'
                  : 'No authentication required (not recommended)'}
              </CardDescription>
            </div>
            <Switch
              checked={authMode === 'token'}
              onCheckedChange={handleAuthModeChange}
            />
          </div>
        </CardHeader>

        {/* Warning for no auth */}
        {authMode === 'none' && (
          <CardContent className="pt-0">
            <Alert variant={isLocalOnly ? 'default' : 'destructive'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {isLocalOnly ? (
                  <>
                    <span className="font-medium">Local access only.</span>{' '}
                    Since your instance is bound to localhost, running without
                    authentication is relatively safe. Only applications on this
                    computer can access it.
                  </>
                ) : (
                  <>
                    <span className="font-medium">Security risk!</span> Your
                    instance is accessible on the network. Without
                    authentication, anyone on your network can access and
                    control OpenClaw. This is strongly discouraged.
                  </>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {/* Token Configuration - Only show when auth is enabled */}
      {authMode === 'token' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Security Token</CardTitle>
            <CardDescription>
              This token is required to authenticate with the OpenClaw gateway
              API. Keep it secure and don't share it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Token Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="auth-token">Token</Label>
                <div className="flex items-center gap-2">
                  {saving && <Spinner size="sm" />}
                  <span
                    className={cn('text-xs font-medium', tokenStrength.color)}
                  >
                    {tokenStrength.level}
                  </span>
                  {instance.tokenGenerated && (
                    <Badge variant="secondary" className="text-xs">
                      Auto-generated
                    </Badge>
                  )}
                </div>
              </div>

              {/* Token strength bar */}
              <div className="flex gap-1 h-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={cn(
                      'flex-1 rounded-full transition-colors',
                      tokenStrength.score >= level
                        ? level <= 1
                          ? 'bg-destructive'
                          : level <= 2
                            ? 'bg-warning'
                            : 'bg-success'
                        : 'bg-muted',
                    )}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="auth-token"
                    type={showToken ? 'text' : 'password'}
                    value={instance.authToken}
                    onChange={handleTokenChange}
                    onBlur={handleTokenBlur}
                    placeholder="Enter or generate a token"
                    className="font-mono pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyToken}
                  disabled={!instance.authToken}
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {instance.authToken &&
                instance.authToken.length > 0 &&
                instance.authToken.length < 16 && (
                  <p className="text-xs text-destructive">
                    Token should be at least 16 characters for adequate security
                  </p>
                )}

              {saveError && <p className="text-xs text-warning">{saveError}</p>}
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerateToken}
              disabled={generating}
              variant={instance.authToken ? 'outline' : 'default'}
              className="w-full"
            >
              {generating ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {instance.authToken
                    ? 'Generate New Token'
                    : 'Generate Secure Token'}
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Generates a cryptographically secure 64-character hex token
            </p>
          </CardContent>
        </Card>
      )}

      {/* Token Info - Only show when auth is enabled and token exists */}
      {authMode === 'token' && instance.authToken && (
        <Card className="bg-muted/30">
          <CardContent className="pt-4 space-y-3">
            <h4 className="text-sm font-medium">Token Usage</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Your token will be used for:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Authenticating API requests to the gateway</li>
                <li>Connecting messaging providers</li>
                <li>Accessing the web interface</li>
                <li>CLI and SDK integrations</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Tips - Always show */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-500">Security Best Practices</p>
            <ul className="text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Use a unique token for each instance</li>
              <li>
                Never share your token publicly or commit it to version control
              </li>
              <li>Regenerate tokens periodically for better security</li>
              <li>
                Use environment variables to store tokens in your applications
              </li>
              {!isLocalOnly && (
                <li className="text-warning">
                  Always use authentication when network access is enabled
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Save Reminder - Only show for auto-generated tokens */}
      {authMode === 'token' &&
        instance.tokenGenerated &&
        instance.authToken && (
          <Alert className="bg-warning/10 border-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription>
              <span className="font-medium text-warning">
                Remember to save your token!
              </span>
              <p className="text-muted-foreground mt-1">
                Your token is stored securely by Clawpit, but you should also
                save it somewhere safe for use in external applications. If you
                regenerate the token, existing connections will stop working.
              </p>
            </AlertDescription>
          </Alert>
        )}

      {/* Example usage */}
      {authMode === 'token' &&
        instance.authToken &&
        instance.authToken.length >= 16 && (
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <h4 className="text-sm font-medium mb-2">Example API Usage</h4>
              <div className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto">
                <code className="text-muted-foreground">
                  curl -H "Authorization: Bearer{' '}
                  <span className="text-foreground">{'<your-token>'}</span>" \
                  <br />
                  {'  '}http://localhost:{instance.gatewayPort}/api/health
                </code>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}

export default AuthStep;
