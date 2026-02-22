import { convertFileSrc } from '@tauri-apps/api/core';
import { AlertTriangle, Layers, Users } from 'lucide-react';
import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui';
import { useTemplateStore } from '@/stores';

interface TemplateBrowserProps {
  onSelectTemplate?: (templateId: string) => void;
}

export function TemplateBrowser({ onSelectTemplate }: TemplateBrowserProps) {
  const { templates, isLoading, error, loadTemplates } = useTemplateStore();

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return (
    <div className="space-y-6">
      {/* Subtitle */}
      <p className="text-muted-foreground">
        Pre-configured team setups with specialized AI agents. Choose a template
        to get started quickly with a coordinated team.
      </p>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-4 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 pb-4">
        {isLoading &&
          templates.length === 0 &&
          [1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              {/* Skeleton hero */}
              <div className="h-40 rounded-t-xl bg-muted" />
              <CardContent className="space-y-4 pt-4">
                <div className="flex">
                  {[1, 2, 3, 4].map((j) => (
                    <div
                      key={j}
                      className="h-11 w-11 rounded-full bg-muted ring-2 ring-background"
                      style={{ marginLeft: j === 1 ? 0 : '-0.75rem' }}
                    />
                  ))}
                </div>
                <div className="h-4 w-24 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}

        {!isLoading && templates.length === 0 && !error && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <Layers className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No templates available. Check that the templates folder is
                properly configured.
              </p>
            </CardContent>
          </Card>
        )}

        {templates.map((template) => (
          <Card
            key={template.id}
            className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
            onClick={() => onSelectTemplate?.(template.id)}
          >
            {/* Hero section with image background */}
            <div className="relative h-52 overflow-hidden rounded-t-xl">
              {/* Background Image */}
              {template.image ? (
                <img
                  src={convertFileSrc(template.image)}
                  alt={template.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
              )}

              {/* Dark Gradient Overlay (bottom to top) */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

              {/* Description */}
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="line-clamp-2 text-sm text-white/80">
                  {template.description}
                </p>
              </div>
            </div>

            <CardContent className="space-y-4 pt-4">
              {/* Member avatars - stacked */}
              <div className="flex items-center">
                {template.memberAvatars.slice(0, 5).map((member, index) => (
                  <div
                    key={member.id}
                    className="group relative transition-all duration-200 hover:!z-50"
                    style={{
                      marginLeft: index === 0 ? 0 : '-0.75rem',
                      zIndex: index + 1,
                    }}
                  >
                    {/* Avatar */}
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-muted text-lg ring-2 ring-background transition-all duration-200 group-hover:scale-125 group-hover:ring-primary/50 group-hover:shadow-[0_0_16px_rgba(124,58,237,0.5)]">
                      {member.avatar ? (
                        <img
                          src={convertFileSrc(member.avatar)}
                          alt={member.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        member.emoji
                      )}
                    </div>

                    {/* Tooltip popup */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 scale-95 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
                      <div className="whitespace-nowrap rounded-lg bg-popover px-3 py-2 text-center shadow-lg ring-1 ring-border">
                        <p className="text-sm font-medium text-foreground">
                          {member.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.role}
                        </p>
                      </div>
                      {/* Arrow */}
                      <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-popover" />
                    </div>
                  </div>
                ))}
                {template.memberCount > 5 && (
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-2 ring-background"
                    style={{
                      marginLeft: '-0.75rem',
                      zIndex: 6,
                    }}
                  >
                    +{template.memberCount - 5}
                  </div>
                )}
              </div>

              {/* Member count */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>
                  {template.memberCount} team member
                  {template.memberCount === 1 ? '' : 's'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
