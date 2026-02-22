import { CoreServicesMonitor } from '@/components/dashboard';
import { EgressLogsTable } from '@/components/security/egress-logs-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';

interface SecurityScreenProps {
  clawpitDir: string | null;
}

export function SecurityScreen({ clawpitDir }: SecurityScreenProps) {
  return (
    <div className="mx-auto w-full space-y-6">
      {clawpitDir ? (
        <>
          <div className="w-full">
            <CoreServicesMonitor clawpitDir={clawpitDir} />
          </div>
          <EgressLogsTable clawpitDir={clawpitDir} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              Security services are not yet configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Complete the setup wizard to configure security services.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
