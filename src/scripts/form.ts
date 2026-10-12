// "Plan your project" form: validation, submission and accessible states.
// Posts JSON to PUBLIC_LEAD_ENDPOINT (FLAM's Base44 intake function).
import { track } from './analytics';
import { landingReferrer, utm } from './context';

const ENDPOINT: string | undefined = import.meta.env.PUBLIC_LEAD_ENDPOINT;
const TIMEOUT_MS = 15000;

type FieldName = 'full_name' | 'business_name' | 'business_type' | 'email' | 'phone' | 'website_url' | 'consent';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

function normaliseUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(normaliseUrl(value));
    return u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function initProjectForm(root: HTMLElement) {
  const copy = JSON.parse(root.dataset.formCopy ?? '{}') as {
    name: string; business: string; type: string; contact: string; email: string; phone: string; url: string; consent: string;
    fixOne: string; fixMany: string; sending: string; sendingStatus: string; submit: string; failed: string; noEndpoint: string; retry: string; success: string;
  };
  const form = root.querySelector<HTMLFormElement>('form')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submitLabel = submit.querySelector<HTMLElement>('[data-label]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const success = root.querySelector<HTMLElement>('[data-success]')!;
  const failure = root.querySelector<HTMLElement>('[data-failure]')!;
  const devWarning = root.querySelector<HTMLElement>('[data-dev-warning]');

  if (!ENDPOINT && import.meta.env.DEV && devWarning) devWarning.hidden = false;

  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
  const value = (name: string) => (field(name)?.value ?? '').trim();
  const touched = new Set<FieldName>();

  function setError(name: FieldName, message: string) {
    const input = field(name);
    const err = root.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    if (!input || !err) return;
    err.textContent = message;
    err.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function validate(name: FieldName): string {
    switch (name) {
      case 'full_name':
        return value('full_name') ? '' : copy.name;
      case 'business_name':
        return value('business_name') ? '' : copy.business;
      case 'business_type':
        return value('business_type') ? '' : copy.type;
      case 'email': {
        const email = value('email');
        if (!email && !value('phone')) return copy.contact;
        if (email && !EMAIL_RE.test(email)) return copy.email;
        return '';
      }
      case 'phone': {
        const phone = value('phone');
        if (phone && !PHONE_RE.test(phone)) return copy.phone;
        return '';
      }
      case 'website_url': {
        const url = value('website_url');
        return url && !isValidUrl(url) ? copy.url : '';
      }
      case 'consent':
        return field('consent')?.checked ? '' : copy.consent;
    }
  }

  const fields: FieldName[] = ['full_name', 'business_name', 'business_type', 'email', 'phone', 'website_url', 'consent'];

  function check(name: FieldName): boolean {
    const msg = validate(name);
    setError(name, msg);
    return !msg;
  }

  // Inline validation: after a field has been left once, re-check as the user types.
  for (const name of fields) {
    const input = field(name);
    if (!input) continue;
    input.addEventListener('blur', () => {
      if (name === 'consent') return;
      touched.add(name);
      check(name);
      if (name === 'phone' && touched.has('email')) check('email');
    });
    input.addEventListener(name === 'consent' || name === 'business_type' ? 'change' : 'input', () => {
      if (touched.has(name) || input.getAttribute('aria-invalid')) check(name);
      if (name === 'phone' || name === 'email') {
        if (touched.has('email') || field('email')?.getAttribute('aria-invalid')) check('email');
      }
    });
  }

  let started = false;
  form.addEventListener('focusin', () => {
    if (started) return;
    started = true;
    track('form_start');
  });

  function setLoading(loading: boolean) {
    submit.disabled = loading;
    form.setAttribute('aria-busy', String(loading));
    submitLabel.textContent = loading ? copy.sending : copy.submit;
  }

  function showFailure(reason: string) {
    failure.hidden = false;
    status.textContent = copy.failed + ' ' + reason;
    failure.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    failure.hidden = true;
    fields.forEach((f) => touched.add(f));

    const invalid = fields.filter((f) => !check(f));
    if (invalid.length) {
      status.textContent = invalid.length === 1 ? copy.fixOne : copy.fixMany.replace('{count}', String(invalid.length));
      field(invalid[0])?.focus();
      return;
    }

    const payload = {
      full_name: value('full_name').slice(0, 120),
      business_name: value('business_name').slice(0, 160),
      business_type: value('business_type'),
      email: value('email').slice(0, 200),
      phone: value('phone').slice(0, 40),
      website_url: normaliseUrl(value('website_url')).slice(0, 300),
      message: value('message').slice(0, 1000),
      consent: true as const,
      source_page: location.pathname,
      ...utm(),
      referrer: landingReferrer(),
      submitted_at: new Date().toISOString(),
      hp: field('hp')?.value ?? '',
    };

    if (!ENDPOINT) {
      if (import.meta.env.DEV) console.warn('[form] PUBLIC_LEAD_ENDPOINT is not set. Payload:', payload);
      track('form_submit_error', 'no_endpoint');
      showFailure(copy.noEndpoint);
      return;
    }

    setLoading(true);
    status.textContent = copy.sendingStatus;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'omit',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok !== true) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${res.status}`);
      }

      track('form_submit_success');
      form.hidden = true;
      success.hidden = false;
      status.textContent = copy.success;
      success.focus();
    } catch (err) {
      const reason = err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : 'request_failed';
      track('form_submit_error', reason);
      showFailure(copy.retry);
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  });
}

document.querySelectorAll<HTMLElement>('[data-project-form]').forEach(initProjectForm);
