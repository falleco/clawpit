export type MainView =
  | 'home'
  | 'prerequisites'
  | 'wsl-wizard'
  | 'docker-wizard'
  | 'installation-guide'
  | 'setup-wizard'
  | 'dashboard'
  | 'health'
  | 'templates'
  | 'security'
  | 'terminal';

export const MAIN_VIEW_ROUTES: Record<MainView, string> = {
  home: '/',
  prerequisites: '/prerequisites',
  'wsl-wizard': '/setup/wsl',
  'docker-wizard': '/setup/docker',
  'installation-guide': '/setup/installation-guide',
  'setup-wizard': '/setup/wizard',
  dashboard: '/dashboard',
  health: '/health',
  templates: '/templates',
  security: '/security',
  terminal: '/terminal',
};

const ROUTE_TO_MAIN_VIEW: Record<string, MainView> = {
  '/index.html': 'home',
  '/': 'home',
  '/prerequisites': 'prerequisites',
  '/setup/wsl': 'wsl-wizard',
  '/setup/docker': 'docker-wizard',
  '/setup/installation-guide': 'installation-guide',
  '/setup/wizard': 'setup-wizard',
  '/dashboard': 'dashboard',
  '/health': 'health',
  '/templates': 'templates',
  '/security': 'security',
  '/terminal': 'terminal',
};

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return '/';
  }

  let normalized = pathname;
  if (normalized.startsWith('/index.html')) {
    normalized = normalized.replace('/index.html', '') || '/';
  }

  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || '/';
}

export function getMainViewFromPath(pathname: string): MainView {
  const normalized = normalizePathname(pathname);
  return ROUTE_TO_MAIN_VIEW[normalized] ?? 'home';
}
