// Local mock of FLAM's Base44 intake functions, for development and testing.
// Mirrors the integration contract in README.md. Not for production.
//
//   npm run mock                      -> http://localhost:8787
//   MOCK_FAIL=1 npm run mock          -> /submitLead always returns 500 (test the error state)
//   MOCK_DELAY_MS=2000 npm run mock   -> slow responses (test the loading state)
//
// Stored data: mock/data/leads.jsonl and mock/data/events.jsonl
// Inspect:     GET /leads, GET /events

import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MOCK_PORT || 8787);
const FAIL = process.env.MOCK_FAIL === '1';
const DELAY = Number(process.env.MOCK_DELAY_MS || 0);
const ALLOWED_ORIGINS = (process.env.MOCK_ALLOWED_ORIGINS || 'http://localhost:4321,http://127.0.0.1:4321')
  .split(',').map((s) => s.trim()).filter(Boolean);

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');
mkdirSync(DATA_DIR, { recursive: true });
const LEADS = join(DATA_DIR, 'leads.jsonl');
const EVENTS = join(DATA_DIR, 'events.jsonl');

const BUSINESS_TYPES = ['clinic', 'beauty_wellness', 'trades_home_services', 'professional_services', 'other'];
const EVENT_NAMES = ['page_view', 'cta_click', 'whatsapp_click', 'form_start', 'form_submit_success', 'form_submit_error', 'scroll_75'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
    return true;
  }
  return !origin; // same-origin / curl requests have no Origin header
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error('payload_too_large');
  }
  return JSON.parse(raw || '{}'); // accepts application/json and text/plain bodies
}

function validateLead(b) {
  if (str(b.hp, 200)) return { error: 'rejected' };
  const lead = {
    full_name: str(b.full_name, 120),
    business_name: str(b.business_name, 160),
    business_type: str(b.business_type, 40),
    email: str(b.email, 200),
    phone: str(b.phone, 40),
    website_url: str(b.website_url, 300),
    message: str(b.message, 1000),
    consent: b.consent === true,
    source_page: str(b.source_page, 200),
    utm_source: str(b.utm_source, 120),
    utm_medium: str(b.utm_medium, 120),
    utm_campaign: str(b.utm_campaign, 120),
    referrer: str(b.referrer, 500),
    submitted_at: str(b.submitted_at, 40),
  };
  if (!lead.full_name) return { error: 'full_name is required' };
  if (!lead.business_name) return { error: 'business_name is required' };
  if (!BUSINESS_TYPES.includes(lead.business_type)) return { error: 'business_type is invalid' };
  if (!lead.email && !lead.phone) return { error: 'email or phone is required' };
  if (lead.email && !EMAIL_RE.test(lead.email)) return { error: 'email is invalid' };
  if (!lead.consent) return { error: 'consent is required' };
  return { lead: { ...lead, status: 'New', received_at: new Date().toISOString() } };
}

function validateEvent(b) {
  if (!EVENT_NAMES.includes(b.event)) return { error: 'unknown event' };
  return {
    event: {
      event: b.event,
      page: str(b.page, 200),
      referrer: str(b.referrer, 500),
      utm_source: str(b.utm_source, 120),
      utm_medium: str(b.utm_medium, 120),
      utm_campaign: str(b.utm_campaign, 120),
      device: ['mobile', 'tablet', 'desktop'].includes(b.device) ? b.device : 'unknown',
      session_id: str(b.session_id, 64),
      cta_id: str(b.cta_id, 64),
      occurred_at: str(b.occurred_at, 40),
    },
  };
}

const readLines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

createServer(async (req, res) => {
  const allowed = cors(req, res);
  const path = new URL(req.url, 'http://x').pathname;

  if (req.method === 'OPTIONS') { res.writeHead(allowed ? 204 : 403); return res.end(); }
  if (req.method === 'GET' && path === '/leads') return send(res, 200, readLines(LEADS));
  if (req.method === 'GET' && path === '/events') return send(res, 200, readLines(EVENTS));
  if (!allowed) return send(res, 403, { ok: false, error: 'origin not allowed' });
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });

  if (DELAY) await new Promise((r) => setTimeout(r, DELAY));

  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { ok: false, error: 'invalid JSON' }); }

  if (path === '/submitLead') {
    if (FAIL) return send(res, 500, { ok: false, error: 'mock failure (MOCK_FAIL=1)' });
    const { lead, error } = validateLead(body);
    if (error) { console.log('[lead rejected]', error); return send(res, 400, { ok: false, error }); }
    appendFileSync(LEADS, JSON.stringify(lead) + '\n');
    console.log('[lead]', lead.full_name, '·', lead.business_name, '·', lead.business_type);
    return send(res, 200, { ok: true });
  }

  if (path === '/trackEvent') {
    const { event, error } = validateEvent(body);
    if (error) return send(res, 400, { ok: false, error });
    appendFileSync(EVENTS, JSON.stringify(event) + '\n');
    console.log('[event]', event.event, event.page, event.cta_id || '');
    return send(res, 200, { ok: true });
  }

  send(res, 404, { ok: false, error: 'not found' });
}).listen(PORT, () => {
  console.log(`FLAM mock intake on http://localhost:${PORT}  (allowed origins: ${ALLOWED_ORIGINS.join(', ')})${FAIL ? '  [MOCK_FAIL]' : ''}`);
});
