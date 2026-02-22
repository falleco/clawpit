import { AlertTriangle, Play, Server, Square } from 'lucide-react';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClawpitInstance } from '@/stores';

interface StatusOverviewProps {
  instances: ClawpitInstance[];
}

interface StatusCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

function StatusCard({
  title,
  value,
  icon,
  description,
  variant = 'default',
}: StatusCardProps) {
  const variantStyles = {
    default: 'text-muted-foreground',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    danger: 'text-red-500',
  };

  const bgStyles = {
    default: 'bg-muted/50',
    success: 'bg-green-500/10',
    warning: 'bg-yellow-500/10',
    danger: 'bg-red-500/10',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`p-2 rounded-md ${bgStyles[variant]}`}>
          <div className={variantStyles[variant]}>{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function StatusOverview({ instances }: StatusOverviewProps) {
  const stats = useMemo(() => {
    const running = instances.filter((i) => i.status === 'running').length;
    const stopped = instances.filter((i) => i.status === 'stopped').length;
    const errors = instances.filter((i) => i.status === 'error').length;
    const transitioning = instances.filter(
      (i) => i.status === 'starting' || i.status === 'stopping',
    ).length;

    return {
      total: instances.length,
      running,
      stopped,
      errors,
      transitioning,
    };
  }, [instances]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatusCard
        title="Total Instances"
        value={stats.total}
        icon={<Server className="h-4 w-4" />}
        description="OpenClaw instances configured"
        variant="default"
      />
      <StatusCard
        title="Running"
        value={stats.running}
        icon={<Play className="h-4 w-4" />}
        description={
          stats.transitioning > 0
            ? `${stats.transitioning} transitioning`
            : 'Active instances'
        }
        variant="success"
      />
      <StatusCard
        title="Stopped"
        value={stats.stopped}
        icon={<Square className="h-4 w-4" />}
        description="Inactive instances"
        variant="default"
      />
      <StatusCard
        title="Errors"
        value={stats.errors}
        icon={<AlertTriangle className="h-4 w-4" />}
        description={stats.errors > 0 ? 'Require attention' : 'All healthy'}
        variant={stats.errors > 0 ? 'danger' : 'default'}
      />
    </div>
  );
}

export default StatusOverview;
