import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import {
  GlassMaterialVariant,
  isGlassSupported,
  setLiquidGlassEffect,
} from 'tauri-plugin-liquid-glass-api';
import { ErrorBoundary } from '@/components/error/error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { saveRuntimeCapabilities } from '@/lib/runtime-capabilities';
import App from './app';
import './index.css';

// Enable dark mode by default (matches app preference default)
document.documentElement.classList.add('dark');

async function bootstrap() {
  let liquidGlassSupported = false;
  let liquidGlassEnabled = false;

  try {
    liquidGlassSupported = await isGlassSupported();

    if (liquidGlassSupported) {
      await setLiquidGlassEffect({
        enabled: true,
        cornerRadius: 16,
        tintColor: '#ffffff55',
        variant: GlassMaterialVariant.Sidebar,
      });
      liquidGlassEnabled = true;
    } else {
      await setLiquidGlassEffect({ enabled: false });
    }
  } catch (error) {
    console.error('Failed to initialize liquid glass:', error);
    try {
      await setLiquidGlassEffect({ enabled: false });
    } catch {
      // Ignore cleanup errors when effect is unavailable.
    }
  }

  saveRuntimeCapabilities({
    liquidGlassSupported,
    liquidGlassEnabled,
    checkedAtIso: new Date().toISOString(),
  });

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <TooltipProvider delayDuration={200}>
          <HashRouter>
            <App />
          </HashRouter>
        </TooltipProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

void bootstrap();
