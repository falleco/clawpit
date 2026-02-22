import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Platform {
  os: string;
  is_wsl: boolean;
}

interface FirewallGuidanceProps {
  gatewayPort: number;
  bridgePort: number;
  bindMode: 'local' | 'lan';
}

export function FirewallGuidance({
  gatewayPort,
  bridgePort,
  bindMode,
}: FirewallGuidanceProps) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const detectPlatform = async () => {
      try {
        const p = await invoke<Platform>('get_platform');
        setPlatform(p);
      } catch {
        // Fallback detection
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('win')) {
          setPlatform({ os: 'windows', is_wsl: false });
        } else if (userAgent.includes('mac')) {
          setPlatform({ os: 'macos', is_wsl: false });
        } else {
          setPlatform({ os: 'linux', is_wsl: false });
        }
      }
    };

    detectPlatform();
  }, []);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  };

  // Only show firewall guidance for LAN mode
  if (bindMode === 'local') {
    return (
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>
              Firewall configuration not needed for localhost-only access.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ports = [gatewayPort, bridgePort];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-warning" />
            <CardTitle className="text-lg">Firewall Configuration</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        <CardDescription>
          To allow access from other devices on your network, you may need to
          configure your firewall.
        </CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              These ports need to be accessible:{' '}
              <strong>{ports.join(', ')}</strong>
            </AlertDescription>
          </Alert>

          {/* Windows Instructions */}
          {platform?.os === 'windows' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Windows</Badge>
                <span className="text-sm font-medium">
                  Windows Defender Firewall
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Run the following commands in an elevated PowerShell (Run as
                  Administrator):
                </p>

                {ports.map((port) => (
                  <div
                    key={port}
                    className="relative rounded-md bg-muted p-3 font-mono text-xs"
                  >
                    <code>
                      netsh advfirewall firewall add rule name="OpenClaw Port{' '}
                      {port}" dir=in action=allow protocol=tcp localport={port}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6"
                      onClick={() =>
                        handleCopy(
                          `netsh advfirewall firewall add rule name="OpenClaw Port ${port}" dir=in action=allow protocol=tcp localport=${port}`,
                          `win-${port}`,
                        )
                      }
                    >
                      {copied === `win-${port}` ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                ))}

                <p className="text-muted-foreground">
                  Or use Windows Defender Firewall with Advanced Security GUI.
                </p>
              </div>
            </div>
          )}

          {/* macOS Instructions */}
          {platform?.os === 'macos' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>macOS</Badge>
                <span className="text-sm font-medium">
                  Application Firewall
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  macOS Application Firewall typically allows outgoing
                  connections. If you have strict firewall rules:
                </p>

                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>
                    Open <strong>System Preferences</strong> {'>'}{' '}
                    <strong>Security & Privacy</strong> {'>'}{' '}
                    <strong>Firewall</strong>
                  </li>
                  <li>
                    Click <strong>Firewall Options</strong>
                  </li>
                  <li>
                    Add your application and set to{' '}
                    <strong>Allow incoming connections</strong>
                  </li>
                </ol>

                <p className="text-muted-foreground">
                  Or use the terminal to allow specific ports:
                </p>

                <div className="relative rounded-md bg-muted p-3 font-mono text-xs">
                  <code>
                    sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add
                    /Applications/Clawpit.app
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-6 w-6"
                    onClick={() =>
                      handleCopy(
                        'sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /Applications/Clawpit.app',
                        'macos',
                      )
                    }
                  >
                    {copied === 'macos' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Linux Instructions */}
          {platform?.os === 'linux' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Linux</Badge>
                <span className="text-sm font-medium">iptables / ufw</span>
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <strong>Using UFW (Ubuntu/Debian):</strong>
                </p>

                {ports.map((port) => (
                  <div
                    key={port}
                    className="relative rounded-md bg-muted p-3 font-mono text-xs"
                  >
                    <code>sudo ufw allow {port}/tcp</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6"
                      onClick={() =>
                        handleCopy(`sudo ufw allow ${port}/tcp`, `ufw-${port}`)
                      }
                    >
                      {copied === `ufw-${port}` ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                ))}

                <p className="text-muted-foreground mt-4">
                  <strong>Using firewalld (Fedora/RHEL):</strong>
                </p>

                {ports.map((port) => (
                  <div
                    key={`firewalld-${port}`}
                    className="relative rounded-md bg-muted p-3 font-mono text-xs"
                  >
                    <code>
                      sudo firewall-cmd --permanent --add-port={port}/tcp
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6"
                      onClick={() =>
                        handleCopy(
                          `sudo firewall-cmd --permanent --add-port=${port}/tcp`,
                          `firewalld-${port}`,
                        )
                      }
                    >
                      {copied === `firewalld-${port}` ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                ))}

                <div className="relative rounded-md bg-muted p-3 font-mono text-xs mt-2">
                  <code>sudo firewall-cmd --reload</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-6 w-6"
                    onClick={() =>
                      handleCopy(
                        'sudo firewall-cmd --reload',
                        'firewalld-reload',
                      )
                    }
                  >
                    {copied === 'firewalld-reload' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Router Note */}
          <Alert className="bg-muted/50">
            <AlertDescription className="text-sm">
              <strong>Note:</strong> If you want to access OpenClaw from outside
              your local network, you'll also need to configure port forwarding
              on your router. This is an advanced configuration and has security
              implications.
            </AlertDescription>
          </Alert>

          {/* External Link */}
          <Button
            variant="link"
            className="p-0 h-auto text-sm"
            onClick={() => {
              void openUrl('https://docs.openclaw.io/network/firewall');
            }}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Learn more about network configuration
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
