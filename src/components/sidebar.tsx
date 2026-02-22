import { Boxes, HeartPulse, Home, LibraryBig, Shield } from 'lucide-react';
import {
  ThemeToggle,
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { cn } from '@/lib/utils';

export type SidebarView =
  | 'home'
  | 'dashboard'
  | 'health'
  | 'templates'
  | 'security';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: SidebarView) => void;
  showDashboard?: boolean;
}

interface SidebarButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick: () => void;
}

function SidebarButton({ icon, label, isActive, onClick }: SidebarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          title={label}
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center transition-colors titlebar-no-drag',
            'hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive && 'bg-white/70 text-primary dark:bg-white/15',
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <TooltipArrow />
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({
  currentView,
  onNavigate,
  showDashboard,
}: SidebarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <aside className="relative z-30 h-screen min-h-screen max-h-screen w-28 shrink-0 p-2 titlebar-drag-region">
        <div
          className={cn(
            'relative z-20 h-full w-full rounded-[16px] border border-white/40 shadow-[0_12px_35px_rgba(15,23,42,0.12)]',
            'dark:border-white/10',
          )}
        >
          <div className="pointer-events-none absolute inset-0 rounded-[16px] bg-gradient-to-bl from-purple-100 to-gray-50 opacity-60" />
          <div className="pointer-events-none absolute inset-0 rounded-[16px] bg-white/45 backdrop-blur-2xl dark:bg-slate-900/45" />

          <div className="relative z-10 flex h-full flex-col items-center py-5 pt-10">
            {/* Top section - Main navigation */}
            <div className="flex flex-col items-center gap-2">
              <SidebarButton
                icon={<Home className="h-5 w-5" />}
                label="Home"
                isActive={currentView === 'home'}
                onClick={() => onNavigate('home')}
              />

              {showDashboard && (
                <SidebarButton
                  icon={<Boxes className="h-5 w-5" />}
                  label="Instances"
                  isActive={currentView === 'dashboard'}
                  onClick={() => onNavigate('dashboard')}
                />
              )}

              {showDashboard && (
                <SidebarButton
                  icon={<HeartPulse className="h-5 w-5" />}
                  label="Health"
                  isActive={currentView === 'health'}
                  onClick={() => onNavigate('health')}
                />
              )}

              {showDashboard && (
                <SidebarButton
                  icon={<LibraryBig className="h-5 w-5" />}
                  label="Templates"
                  isActive={currentView === 'templates'}
                  onClick={() => onNavigate('templates')}
                />
              )}

              <SidebarButton
                icon={<Shield className="h-5 w-5" />}
                label="Security"
                isActive={currentView === 'security'}
                onClick={() => onNavigate('security')}
              />
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Bottom section */}
            <div className="flex flex-col items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export default Sidebar;
