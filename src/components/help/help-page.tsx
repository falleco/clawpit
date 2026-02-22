import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useState } from 'react';
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
} from '@/components/ui';

interface HelpPageProps {
  onOpenPrerequisites: () => void;
  onOpenSettings: () => void;
}

interface DiagnosticSnapshot {
  allPassed: boolean;
  errors: Array<{ message: string; severity: 'error' | 'warning' | 'info' }>;
  timestamp: string;
}

export function HelpPage({
  onOpenPrerequisites,
  onOpenSettings,
}: HelpPageProps) {
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticSnapshot | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      const result = await invoke<DiagnosticSnapshot>('check_prerequisites');
      setDiagnostic(result);
    } catch (error) {
      setDiagnosticError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setDiagnosticLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Help & Documentation</CardTitle>
          <CardDescription>
            Troubleshooting, guided recovery actions, and useful documentation
            links.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button onClick={runDiagnostics} disabled={diagnosticLoading}>
            {diagnosticLoading ? 'Running...' : 'Run Diagnostics'}
          </Button>
          <Button variant="outline" onClick={onOpenPrerequisites}>
            Open Requirements
          </Button>
          <Button variant="outline" onClick={onOpenSettings}>
            Open Settings
          </Button>
        </CardContent>
      </Card>

      {diagnosticError && (
        <Alert variant="destructive">
          <AlertTitle>Diagnostics failed</AlertTitle>
          <AlertDescription>{diagnosticError}</AlertDescription>
        </Alert>
      )}

      {diagnostic && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Diagnostic Snapshot</CardTitle>
            <CardDescription>
              {new Date(diagnostic.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p
              className={diagnostic.allPassed ? 'text-success' : 'text-warning'}
            >
              {diagnostic.allPassed
                ? 'All dependency checks passed.'
                : 'Some checks need attention.'}
            </p>
            {diagnostic.errors.length > 0 && (
              <div className="space-y-2">
                {diagnostic.errors.slice(0, 4).map((error, index) => (
                  <div
                    key={`${error.message}-${index}`}
                    className="rounded-md border p-2 text-sm"
                  >
                    {error.message}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting Guide</CardTitle>
          <CardDescription>
            Most common issues and how to recover quickly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTitle>Keyboard Shortcuts</AlertTitle>
            <AlertDescription>
              Use <code>Ctrl/Cmd + 1..5</code> to jump between Home, Dashboard,
              Health, Templates, and Settings.
            </AlertDescription>
          </Alert>
          <FaqItem
            question="Docker is installed but Clawpit says it's not running."
            answer="Start Docker Desktop (or Docker service in Linux/WSL), wait until it becomes healthy, then run diagnostics again."
          />
          <FaqItem
            question="Gateway cannot be reached from browser."
            answer="Check the instance status in Dashboard, confirm ports in Settings > Network, and verify local firewall rules."
          />
          <FaqItem
            question="I changed advanced configuration and now startup fails."
            answer="Use Settings > Advanced to review the JSON/env/compose changes. Clawpit keeps backups before each save."
          />
          <FaqItem
            question="Can I reset everything safely?"
            answer="Yes. Use Settings > Advanced. Import/export is available and factory reset keeps a backup folder before cleanup."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>External Resources</CardTitle>
          <CardDescription>
            Official docs, community, and issue reporting.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button
            variant="outline"
            onClick={() => openUrl('https://openclaw.ai/docs')}
          >
            Open Documentation
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              openUrl('https://github.com/clawpit/clawpit/discussions')
            }
          >
            Community Support
          </Button>
          <Button
            variant="outline"
            onClick={() => openUrl('https://github.com/clawpit/clawpit/issues')}
          >
            Report an Issue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {question}
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">{answer}</p>
    </details>
  );
}

export default HelpPage;
