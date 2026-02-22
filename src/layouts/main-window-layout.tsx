import { ArrowLeft } from 'lucide-react';
import { type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, type SidebarView } from '@/components/sidebar';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface MainWindowLayoutProps {
  currentView: string;
  title: string;
  showBackButton: boolean;
  onBack: () => void;
  showDashboard: boolean;
  onNavigate: (view: SidebarView) => void;
  toolbar?: ReactNode;
  statusIndicatorClassName?: string;
  statusIndicatorTitle?: string;
  rightPanel?: ReactNode;
  liquidGlassSupported: boolean;
}

export function MainWindowLayout({
  currentView,
  title,
  showBackButton,
  onBack,
  showDashboard,
  onNavigate,
  toolbar,
  statusIndicatorClassName,
  statusIndicatorTitle,
  rightPanel,
  liquidGlassSupported,
}: MainWindowLayoutProps) {
  return (
    <div
      className={cn(
        'relative isolate h-screen overflow-hidden text-foreground',
        liquidGlassSupported ? 'bg-transparent' : 'bg-background',
      )}
    >
      {liquidGlassSupported && (
        <div className="pointer-events-none absolute inset-0 z-0 bg-background/45 backdrop-blur-xl dark:bg-background/35" />
      )}

      <div className="relative z-10 flex h-full overflow-hidden">
        <Sidebar
          currentView={currentView}
          onNavigate={onNavigate}
          showDashboard={showDashboard}
        />

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
            <header
              data-tauri-drag-region
              className="h-16 shrink-0 bg-transparent"
            >
              <div
                data-tauri-drag-region
                className="flex h-full items-center justify-between px-6"
              >
                <div
                  data-tauri-drag-region
                  className="flex min-w-0 items-center gap-3"
                >
                  {showBackButton && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onBack}
                      className="titlebar-no-drag h-10 w-10 shrink-0 rounded-xl border-0 bg-transparent shadow-none hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}

                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {title}
                  </h1>

                  {statusIndicatorClassName && (
                    <span
                      className={cn(
                        'inline-block h-3 w-3 shrink-0 rounded-full',
                        statusIndicatorClassName,
                      )}
                      title={statusIndicatorTitle}
                    />
                  )}
                </div>

                <div className="titlebar-no-drag flex items-center gap-2">
                  {toolbar}
                </div>
              </div>
            </header>

            <main className="flex-1 overflow-auto px-6 py-4 pb-16">
              <div className="view-transition h-full">
                <Outlet />
              </div>
            </main>
          </div>

          {rightPanel}
        </div>
      </div>
    </div>
  );
}
