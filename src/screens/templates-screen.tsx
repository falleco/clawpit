import { TemplateBrowser } from '@/components';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';

interface TemplatesScreenProps {
  clawpitDir: string | null;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplatesScreen({
  clawpitDir,
  onSelectTemplate,
}: TemplatesScreenProps) {
  return (
    <div className="mx-auto w-full space-y-6">
      {clawpitDir ? (
        <div className="w-full">
          <TemplateBrowser onSelectTemplate={onSelectTemplate} />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
            <CardDescription>
              Templates are available after finishing the setup wizard.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
