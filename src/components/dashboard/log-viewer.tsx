import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  Clock,
  Copy,
  Download,
  Filter,
  Pause,
  Play,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

// Types matching Rust structs
interface LogEntry {
  timestamp: string | null;
  service: string;
  level: string;
  message: string;
  raw: string;
}

interface LogOptions {
  lines: number | null;
  timestamps: boolean;
  service: string | null;
  follow: boolean;
  since: string | null;
}

interface SystemInfo {
  platform: string;
  appVersion: string;
  instanceId: string;
  instanceName: string;
  exportTime: string;
  dockerVersion: string | null;
}

interface LogViewerProps {
  instanceId: string;
  instanceName: string;
  clawpitDir?: string;
  onClose?: () => void;
}

const LOG_LEVELS = ['all', 'error', 'warn', 'info', 'debug'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

export function LogViewer({
  instanceId,
  instanceName,
  clawpitDir,
  onClose,
}: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>('all');
  const [services, setServices] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get clawpit dir from store if not provided
  const getClawpitDir = useCallback(async () => {
    if (clawpitDir) return clawpitDir;
    // Try to get from invoke
    try {
      const paths = await invoke<{ clawpitDir: string }>(
        'get_default_clawpit_paths',
      );
      return paths.clawpitDir;
    } catch {
      return null;
    }
  }, [clawpitDir]);

  // Fetch services list
  const fetchServices = useCallback(async () => {
    try {
      const dir = await getClawpitDir();
      if (!dir) return;

      const result = await invoke<string[]>('get_instance_services', {
        clawpitDir: dir,
        instanceId,
        wslDistro: null,
      });
      setServices(result);
    } catch (err) {
      console.error('Failed to fetch services:', err);
    }
  }, [instanceId, getClawpitDir]);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const dir = await getClawpitDir();
      if (!dir) {
        setError('Could not determine Clawpit directory');
        return;
      }

      const options: LogOptions = {
        lines: 500,
        timestamps: true,
        service: selectedService,
        follow: false,
        since: null,
      };

      const result = await invoke<LogEntry[]>('get_instance_logs_enhanced', {
        clawpitDir: dir,
        instanceId,
        wslDistro: null,
        options,
      });
      setLogs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [instanceId, selectedService, getClawpitDir]);

  // Initial load
  useEffect(() => {
    fetchServices();
    fetchLogs();
  }, [fetchServices, fetchLogs]);

  // Auto-refresh logs every 5 seconds
  useEffect(() => {
    pollIntervalRef.current = setInterval(fetchLogs, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [autoScroll]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Filter by level
    if (selectedLevel !== 'all') {
      result = result.filter((log) => log.level === selectedLevel);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.message.toLowerCase().includes(query) ||
          log.service.toLowerCase().includes(query),
      );
    }

    return result;
  }, [logs, selectedLevel, searchQuery]);

  // Copy logs to clipboard
  const handleCopy = async () => {
    const text = filteredLogs
      .map((log) => {
        const ts = showTimestamps && log.timestamp ? `[${log.timestamp}] ` : '';
        return `${ts}[${log.service}] ${log.message}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Download logs with system info header
  const handleDownload = async () => {
    try {
      const dir = await getClawpitDir();
      let header = '';

      if (dir) {
        try {
          const sysInfo = await invoke<SystemInfo>('get_system_info_for_logs', {
            clawpitDir: dir,
            instanceId,
            wslDistro: null,
          });

          header = `# Log Export
# ============================================
# Instance: ${sysInfo.instanceName} (${sysInfo.instanceId})
# Platform: ${sysInfo.platform}
# App Version: ${sysInfo.appVersion}
# Docker: ${sysInfo.dockerVersion || 'Unknown'}
# Export Time: ${sysInfo.exportTime}
# ============================================

`;
        } catch {
          // Continue without system info
        }
      }

      const logContent = filteredLogs
        .map((log) => {
          const ts = log.timestamp ? `[${log.timestamp}] ` : '';
          return `${ts}[${log.service}] [${log.level.toUpperCase()}] ${log.message}`;
        })
        .join('\n');

      const blob = new Blob([header + logContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${instanceId}-logs-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download:', err);
    }
  };

  // Get level color
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'debug':
        return 'text-gray-400';
      default:
        return 'text-blue-400';
    }
  };

  // Get level badge variant
  const getLevelBadgeVariant = (level: string) => {
    switch (level) {
      case 'error':
        return 'destructive';
      case 'warn':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex-shrink-0 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Logs: {instanceName}</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSearch(!showSearch)}
              className="h-8 w-8"
              title="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowTimestamps(!showTimestamps)}
              className={cn('h-8 w-8', showTimestamps && 'bg-accent')}
              title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
            >
              <Clock className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAutoScroll(!autoScroll)}
              className="h-8 w-8"
              title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
            >
              {autoScroll ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-8 w-8"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchLogs}
              disabled={isLoading}
              className="h-8 w-8"
              title="Refresh"
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="h-8 w-8"
              title="Download logs"
            >
              <Download className="h-4 w-4" />
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Log level filter */}
          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex gap-1">
              {LOG_LEVELS.map((level) => (
                <Button
                  key={level}
                  variant={selectedLevel === level ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs capitalize"
                  onClick={() => setSelectedLevel(level)}
                >
                  {level}
                </Button>
              ))}
            </div>
          </div>

          {/* Service filter */}
          {services.length > 1 && (
            <select
              value={selectedService || ''}
              onChange={(e) => setSelectedService(e.target.value || null)}
              className="h-7 px-2 text-xs bg-muted rounded-md border border-border"
            >
              <option value="">All services</option>
              {services.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          )}

          {/* Stats */}
          <div className="ml-auto text-xs text-muted-foreground">
            {filteredLogs.length} / {logs.length} entries
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-full px-3 py-1.5 text-sm bg-muted rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        {error ? (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        ) : isLoading && logs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        ) : (
          <div
            ref={logContainerRef}
            className="h-full overflow-auto bg-muted/30 p-4 font-mono text-xs"
          >
            {filteredLogs.length === 0 ? (
              <p className="text-muted-foreground">
                {logs.length === 0 ? 'No logs available' : 'No matching logs'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredLogs.map((log, i) => (
                  <div
                    key={`${log.timestamp ?? i}-${log.service}-${log.message.slice(0, 50)}`}
                    className="flex items-start gap-2 py-0.5 hover:bg-muted/50 rounded px-1 -mx-1"
                  >
                    {showTimestamps && log.timestamp && (
                      <span className="text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    )}
                    <Badge
                      variant={
                        getLevelBadgeVariant(log.level) as
                          | 'default'
                          | 'secondary'
                          | 'destructive'
                          | 'outline'
                      }
                      className="text-[10px] px-1 py-0 h-4 flex-shrink-0"
                    >
                      {log.level.toUpperCase()}
                    </Badge>
                    <span className="text-primary/70 flex-shrink-0">
                      [{log.service}]
                    </span>
                    <span className={cn('break-all', getLevelColor(log.level))}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    // Return shortened version if parsing fails
    return timestamp.slice(11, 19);
  }
}

export default LogViewer;
