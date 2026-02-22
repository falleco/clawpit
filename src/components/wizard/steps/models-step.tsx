import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { CheckCircle, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from '@/components/ui';
import { useWizardStore } from '@/stores';

interface OAuthCompleteResult {
  success: boolean;
  provider: string;
  accountId: string | null;
  error: string | null;
}

interface OAuthProgressEvent {
  step: string;
  message: string;
  isError: boolean;
}

export function ModelsStep() {
  const { data, updateModels } = useWizardStore();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authProgress, setAuthProgress] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  // Check existing auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuthed = await invoke<boolean>('check_openai_auth', {
          clawpitDir: data.clawpitDir,
          instanceId: data.instance.id,
        });

        if (isAuthed) {
          updateModels({
            openai: { enabled: true, authenticated: true },
          });
        }
      } catch (e) {
        // Ignore errors on initial check
        console.log('Auth check error:', e);
      }
    };

    if (data.clawpitDir && data.instance?.id) {
      checkAuth();
    }
  }, [data.clawpitDir, data.instance?.id, updateModels]);

  // Listen for OAuth progress events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen<OAuthProgressEvent>('oauth-progress', (event) => {
        setAuthProgress(event.payload.message);
        if (event.payload.isError) {
          setAuthError(event.payload.message);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleOpenAIAuth = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    setAuthProgress('Starting OAuth flow...');

    try {
      const result = await invoke<OAuthCompleteResult>('start_openai_oauth', {
        clawpitDir: data.clawpitDir,
        instanceId: data.instance.id,
      });

      if (result.success) {
        setAccountId(result.accountId);
        updateModels({
          openai: { enabled: true, authenticated: true },
        });
        setAuthProgress(null);
      } else {
        setAuthError(result.error || 'Authentication failed');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const isOpenAIAuthenticated = data.models?.openai?.authenticated;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Configure AI Models</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Connect your AI model providers to enable intelligent features. You
          can skip this step and configure models later.
        </p>
      </div>

      {/* OpenAI Card */}
      <Card className={isOpenAIAuthenticated ? 'border-success' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <div>
                <CardTitle className="text-lg">OpenAI Codex</CardTitle>
                <CardDescription>
                  Access GPT-4, GPT-4o, and Codex models
                </CardDescription>
              </div>
            </div>
            {isOpenAIAuthenticated && (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Connected</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isOpenAIAuthenticated && !isAuthenticating && (
            <>
              <p className="text-sm text-muted-foreground">
                Connect your OpenAI account using OAuth. This will open your
                browser for secure authentication.
              </p>
              <Button
                onClick={handleOpenAIAuth}
                disabled={isAuthenticating}
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Connect OpenAI Account
              </Button>
            </>
          )}

          {isAuthenticating && (
            <div className="space-y-4">
              <Alert>
                <AlertTitle className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Authenticating...
                </AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    {authProgress ||
                      'Please complete the authentication in your browser...'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    A browser window should have opened. After completing
                    authentication, you will be redirected back automatically.
                  </p>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {isOpenAIAuthenticated && (
            <div className="space-y-3">
              <div className="bg-success/10 rounded-lg p-4">
                <p className="text-sm text-success">
                  OpenAI is connected and ready to use. You can access GPT-4,
                  GPT-4o, and other models through your subscription.
                </p>
                {accountId && (
                  <p className="text-xs text-success/70 mt-2">
                    Account ID: {accountId.slice(0, 8)}...
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                onClick={handleOpenAIAuth}
                disabled={isAuthenticating}
                className="w-full"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-authenticate
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anthropic Card - Coming Soon */}
      <Card className="opacity-60">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#D4A574] flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Anthropic
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-normal">
                  Coming Soon
                </span>
              </CardTitle>
              <CardDescription>Access Claude models</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Anthropic integration will be available in a future update.
          </p>
        </CardContent>
      </Card>

      {/* Error Display */}
      {authError && !isAuthenticating && (
        <Alert variant="destructive">
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      )}

      {/* Skip hint */}
      <p className="text-center text-sm text-muted-foreground">
        You can skip this step and configure AI models later from the dashboard.
      </p>
    </div>
  );
}

export default ModelsStep;
