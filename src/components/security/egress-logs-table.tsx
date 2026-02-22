import { invoke } from '@tauri-apps/api/core';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import type { EgressLogEntry } from '@/types';

interface EgressLogsTableProps {
  clawpitDir: string;
  wslDistro?: string;
  refreshIntervalMs?: number;
  pageSize?: number;
}

type PageToken = number | 'left-ellipsis' | 'right-ellipsis';

export function EgressLogsTable({
  clawpitDir,
  wslDistro,
  refreshIntervalMs = 5000,
  pageSize = 10,
}: EgressLogsTableProps) {
  const [logs, setLogs] = useState<EgressLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLogs = useCallback(
    async (background = false) => {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        setError(null);
        const result = await invoke<EgressLogEntry[]>('get_egress_logs', {
          clawpitDir,
          wslDistro,
          lines: 500,
        });

        setLogs(result);
        setCurrentPage((prev) => {
          const total = Math.max(1, Math.ceil(result.length / pageSize));
          return Math.min(prev, total);
        });
      } catch (err) {
        setError(err as string);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [clawpitDir, pageSize, wslDistro],
  );

  useEffect(() => {
    void fetchLogs(false);

    const interval = setInterval(() => {
      void fetchLogs(true);
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [fetchLogs, refreshIntervalMs]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageItems = logs.slice(pageStart, pageStart + pageSize);

  const pageTokens = useMemo<PageToken[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }

    const tokens: PageToken[] = [1];
    const windowStart = Math.max(2, safePage - 1);
    const windowEnd = Math.min(totalPages - 1, safePage + 1);

    if (windowStart > 2) {
      tokens.push('left-ellipsis');
    }

    for (let page = windowStart; page <= windowEnd; page += 1) {
      tokens.push(page);
    }

    if (windowEnd < totalPages - 1) {
      tokens.push('right-ellipsis');
    }

    tokens.push(totalPages);
    return tokens;
  }, [safePage, totalPages]);

  const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString('en-US', { hour12: false });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Egress Logs</CardTitle>
            <CardDescription>
              Outbound proxy traffic with access decision
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchLogs(true)}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading || isRefreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Domain</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Decision</th>
                <th className="px-4 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    Loading logs...
                  </td>
                </tr>
              )}

              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No egress logs available.
                  </td>
                </tr>
              )}

              {!isLoading &&
                pageItems.map((entry, index) => (
                  <tr
                    key={`${entry.time}-${entry.domain}-${entry.ip}-${index}`}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                      {formatTime(entry.time)}
                    </td>
                    <td className="px-4 py-2">{entry.domain}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {entry.status}
                    </td>
                    <td className="px-4 py-2">
                      {entry.decision === 'approved' ? (
                        <Badge className="border border-green-600/30 bg-green-600/15 text-green-700 hover:bg-green-600/15">
                          Approved
                        </Badge>
                      ) : (
                        <Badge className="border border-red-600/30 bg-red-600/15 text-red-700 hover:bg-red-600/15">
                          Refused
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{entry.ip}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={safePage <= 1}
          >
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {pageTokens.map((token) =>
              typeof token === 'number' ? (
                <Button
                  key={token}
                  size="sm"
                  variant={token === safePage ? 'default' : 'outline'}
                  onClick={() => setCurrentPage(token)}
                >
                  {token}
                </Button>
              ) : (
                <span
                  key={token}
                  className="px-1 text-sm text-muted-foreground"
                >
                  ...
                </span>
              ),
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
            disabled={safePage >= totalPages}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default EgressLogsTable;
