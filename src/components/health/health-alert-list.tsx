import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HealthAlert {
  id: string;
  instanceId: string | null;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  currentValue: string | null;
  thresholdValue: string | null;
  createdAt: string;
  acknowledged: boolean;
  resolved: boolean;
  resolvedAt: string | null;
}

interface HealthAlertListProps {
  alerts: HealthAlert[];
  maxVisible?: number;
}

export function HealthAlertList({
  alerts,
  maxVisible = 5,
}: HealthAlertListProps) {
  const [expanded, setExpanded] = useState(false);

  // Sort alerts by severity (critical first) and then by time
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const aSev = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
    const bSev = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;

    if (aSev !== bSev) return aSev - bSev;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const visibleAlerts = expanded
    ? sortedAlerts
    : sortedAlerts.slice(0, maxVisible);
  const hiddenCount = sortedAlerts.length - maxVisible;

  return (
    <div className="space-y-2">
      {visibleAlerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} />
      ))}

      {hiddenCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-2" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-2" />
              Show {hiddenCount} More Alerts
            </>
          )}
        </Button>
      )}
    </div>
  );
}

interface AlertItemProps {
  alert: HealthAlert;
}

function AlertItem({ alert }: AlertItemProps) {
  const getSeverityInfo = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          icon: AlertCircle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/20',
        };
      default:
        return {
          icon: Info,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
        };
    }
  };

  const severityInfo = getSeverityInfo(alert.severity);
  const Icon = severityInfo.icon;

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatAlertType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border',
        severityInfo.bgColor,
        severityInfo.borderColor,
      )}
    >
      <Icon
        className={cn('h-5 w-5 mt-0.5 flex-shrink-0', severityInfo.color)}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{alert.title}</span>
          <Badge variant="outline" className="text-xs">
            {formatAlertType(alert.alertType)}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>

        {(alert.currentValue || alert.thresholdValue) && (
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {alert.currentValue && (
              <span>
                Current:{' '}
                <span className="font-medium">{alert.currentValue}</span>
              </span>
            )}
            {alert.thresholdValue && (
              <span>
                Threshold:{' '}
                <span className="font-medium">{alert.thresholdValue}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
        <Clock className="h-3 w-3" />
        {formatTime(alert.createdAt)}
      </div>
    </div>
  );
}

export default HealthAlertList;
