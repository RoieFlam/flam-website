// First-party, cookieless analytics. Sends a small set of events to
// PUBLIC_ANALYTICS_ENDPOINT. No personal data, no third parties.
import { device, externalReferrer, landingReferrer, sessionId, utm } from './context';

export type AnalyticsEvent =
  | 'page_view'
  | 'cta_click'
  | 'whatsapp_click'
  | 'form_start'
  | 'form_submit_success'
  | 'form_submit_error'
  | 'scroll_75';

const ENDPOINT: string | undefined = import.meta.env.PUBLIC_ANALYTICS_ENDPOINT;

export function track(event: AnalyticsEvent, ctaId = ''): void {
  const payload = {
    event,
    page: location.pathname,
    referrer: externalReferrer(),
    ...utm(),
    device: device(),
    session_id: sessionId(),
    cta_id: ctaId.slice(0, 64),
    occurred_at: new Date().toISOString(),
  };

  if (!ENDPOINT) {
    if (import.meta.env.DEV) console.debug('[analytics: no endpoint]', payload);
    return;
  }

  // text/plain keeps this a "simple" CORS request (no preflight), which
  // sendBeacon requires. The body is still JSON.
  const body = JSON.stringify(payload);
  const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
  } catch { /* fall through to fetch */ }
  fetch(ENDPOINT, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: true,
    mode: 'cors',
    credentials: 'omit',
  }).catch(() => { /* analytics must never affect the page */ });
}

function init() {
  landingReferrer(); // remember the session's external referrer for the lead form
  track('page_view');

  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-cta], [data-whatsapp]');
    if (!el) return;
    if (el.dataset.whatsapp !== undefined) track('whatsapp_click', el.dataset.whatsapp);
    else track('cta_click', el.dataset.cta);
  });

  let sent75 = false;
  const onScroll = () => {
    if (sent75) return;
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    if ((window.scrollY / scrollable) >= 0.75) {
      sent75 = true;
      track('scroll_75');
      window.removeEventListener('scroll', onScroll);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

init();
