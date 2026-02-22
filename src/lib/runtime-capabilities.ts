export interface RuntimeCapabilities {
  liquidGlassSupported: boolean;
  liquidGlassEnabled: boolean;
  checkedAtIso: string;
}

const RUNTIME_CAPABILITIES_KEY = 'clawpit-runtime-capabilities';

export function loadRuntimeCapabilities(): RuntimeCapabilities | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_CAPABILITIES_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<RuntimeCapabilities>;
    if (
      typeof parsed.liquidGlassSupported !== 'boolean' ||
      typeof parsed.liquidGlassEnabled !== 'boolean' ||
      typeof parsed.checkedAtIso !== 'string'
    ) {
      return null;
    }

    return {
      liquidGlassSupported: parsed.liquidGlassSupported,
      liquidGlassEnabled: parsed.liquidGlassEnabled,
      checkedAtIso: parsed.checkedAtIso,
    };
  } catch {
    return null;
  }
}

export function saveRuntimeCapabilities(
  capabilities: RuntimeCapabilities,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      RUNTIME_CAPABILITIES_KEY,
      JSON.stringify(capabilities),
    );
  } catch {
    // Ignore persistence errors (private mode / storage restrictions).
  }
}
