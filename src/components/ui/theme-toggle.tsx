import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

const themes = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Get current icon
  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div
      className="relative flex items-center justify-center titlebar-no-drag"
      ref={menuRef}
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className={cn(
                'h-11 w-11 rounded-xl flex items-center justify-center transition-colors titlebar-no-drag',
                'hover:bg-white/55 hover:text-foreground dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <CurrentIcon className="h-5 w-5" />
              <span className="sr-only">Toggle theme</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <TooltipArrow />
            Theme
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {open && (
        <div className="absolute left-full top-1/2 z-[120] ml-2 w-36 -translate-y-1/2 rounded-md border border-border/80 bg-popover/95 p-1 shadow-md backdrop-blur-md animate-in fade-in-0 zoom-in-95">
          <div className="pointer-events-none absolute left-0 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-border/80 bg-popover/95" />
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors',
                theme === value && 'bg-accent',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{label}</span>
              {theme === value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ThemeToggle;
