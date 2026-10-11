// Shared, privacy-friendly visit context for analytics and the lead form.
// Kept in sessionStorage only (cleared when the tab closes). No cookies.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Record<UtmKey, string>;

const store = {
  get(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { sessionStorage.setItem(key, value); } catch { /* storage blocked: keep in-memory values */ }
  },
};

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let memorySession: string | null = null;
export function sessionId(): string {
  const existing = store.get('flam_sid') ?? memorySession;
  if (existing) return existing;
  const id = randomId();
  memorySession = id;
  store.set('flam_sid', id);
  return id;
}

// First-touch UTM params for this session; new UTM params in the URL replace them.
export function utm(): Utm {
  const params = new URLSearchParams(location.search);
  const fromUrl = Object.fromEntries(UTM_KEYS.map((k) => [k, (params.get(k) ?? '').slice(0, 120)])) as Utm;
  if (UTM_KEYS.some((k) => fromUrl[k])) {
    store.set('flam_utm', JSON.stringify(fromUrl));
    return fromUrl;
  }
  try {
    const saved = JSON.parse(store.get('flam_utm') ?? 'null');
    if (saved) return saved as Utm;
  } catch { /* ignore */ }
  return { utm_source: '', utm_medium: '', utm_campaign: '' };
}

// The page's referrer, but only when it comes from another site.
export function externalReferrer(): string {
  if (!document.referrer) return '';
  try {
    return new URL(document.referrer).origin === location.origin ? '' : document.referrer.slice(0, 500);
  } catch {
    return '';
  }
}

// The external referrer that started this session (used on the lead).
export function landingReferrer(): string {
  const current = externalReferrer();
  if (current) {
    store.set('flam_ref', current);
    return current;
  }
  return store.get('flam_ref') ?? '';
}

export function device(): 'mobile' | 'tablet' | 'desktop' {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}
