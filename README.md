# FLAM website v2

The official FLAM marketing website. English, mobile-first, static.
Its "Plan your project" form and first-party analytics send data to FLAM's internal Base44 app.

- **Stack:** Astro 7 (static output), plain CSS with design tokens, ~6 KB of vanilla JS in total. Fonts are self-hosted (Instrument Sans, IBM Plex Mono). No UI libraries, no third-party scripts, no cookies.
- **Pages:** `/` (landing), `/about`, `/privacy`, `404`. The form shows its success state inline, so there's no separate thank-you page.
- **Node:** 22.12 or newer (`.nvmrc`).

## Run it

```bash
npm install
cp .env.example .env        # then fill in values (see below)
npm run dev                 # http://localhost:4321
npm run build               # static site in dist/
npm run preview             # serve dist/ locally
```

### Test the form without Base44 (local mock)

```bash
# terminal 1: mock of the Base44 intake functions on http://localhost:8787
npm run mock
# terminal 2: point the site at the mock
PUBLIC_LEAD_ENDPOINT=http://localhost:8787/submitLead \
PUBLIC_ANALYTICS_ENDPOINT=http://localhost:8787/trackEvent \
npm run dev
```

- Received data goes to `mock/data/leads.jsonl` and `mock/data/events.jsonl`. You can also read it at `GET http://localhost:8787/leads` and `/events`.
- `MOCK_FAIL=1 npm run mock` makes every lead submission fail, to test the error state.
- `MOCK_DELAY_MS=2000 npm run mock` slows responses, to test the loading state.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SITE_URL` | for production | The production domain, e.g. `https://flam.co.il` (no trailing slash). It's the **only** place the domain is set: canonical URLs, Open Graph URLs, `sitemap.xml` and `robots.txt` all come from it. **While it's empty, every page gets `noindex` and `robots.txt` disallows all**, so preview builds stay out of search engines. |
| `PUBLIC_LEAD_ENDPOINT` | for the form | URL of the Base44 `submitLead` function. |
| `PUBLIC_ANALYTICS_ENDPOINT` | for analytics | URL of the Base44 `trackEvent` function. |

`PUBLIC_*` values are compiled into the frontend at build time, so they must be public URLs. **Never put a Base44 API key or any secret in these variables or anywhere in this repo.** The Base44 functions are public intake endpoints and do their own validation.

If the endpoints aren't set:
- **Form:** the site still works. In `npm run dev` a yellow "Dev only" notice appears above the form. If someone submits anyway, they get the error state with a WhatsApp button; nothing fails silently.
- **Analytics:** events are skipped. In dev they're logged to the console.

## Integration contract (must match the Base44 app)

Both endpoints:
- accept `POST` with a JSON body;
- return `2xx` with `{ "ok": true }` on success, or non-2xx with `{ "ok": false, "error": "..." }` on failure;
- allow CORS only for origins in an allowlist (localhost and preview URLs now, the production domain once it's bought). They must answer the `OPTIONS` preflight for the lead endpoint.

### `POST PUBLIC_LEAD_ENDPOINT` (submitLead)

Sent with `Content-Type: application/json`.

```json
{
  "full_name": "Dana Cohen",
  "business_name": "Cohen Physio",
  "business_type": "clinic",
  "email": "dana@example.com",
  "phone": "054-123-4567",
  "website_url": "https://cohenphysio.co.il",
  "message": "Need a new site and a way to track inquiries.",
  "consent": true,
  "source_page": "/",
  "utm_source": "instagram",
  "utm_medium": "social",
  "utm_campaign": "launch",
  "referrer": "https://www.google.com/",
  "submitted_at": "2026-10-11T09:22:59.449Z",
  "hp": ""
}
```

- `business_type` is one of `clinic`, `beauty_wellness`, `trades_home_services`, `professional_services`, `other`.
- At least one of `email` / `phone` is non-empty. Optional fields are sent as `""`.
- `website_url` is normalised to start with `https://` when the visitor leaves out the protocol.
- `hp` is a honeypot. Reject the submission if it's non-empty.
- `referrer` is the external site that started the visit (kept for the session), not internal page hops.
- UTM values are the session's first-touch UTM tags (new tags in a later URL replace them).
- Client-side limits: name 120, business 160, email 200, phone 40, URL 300, message 1000 characters. The server should enforce its own limits too.

### `POST PUBLIC_ANALYTICS_ENDPOINT` (trackEvent)

Sent with `navigator.sendBeacon`, or `fetch(..., { keepalive: true })` as a fallback. **The body is JSON, but the `Content-Type` is `text/plain;charset=UTF-8`.** That keeps it a "simple" CORS request, which `sendBeacon` needs. The Base44 function must parse the raw body as JSON whatever the content type says.

```json
{
  "event": "cta_click",
  "page": "/",
  "referrer": "",
  "utm_source": "",
  "utm_medium": "",
  "utm_campaign": "",
  "device": "mobile",
  "session_id": "614af755-4fcd-4b9f-9755-833490fcfe04",
  "cta_id": "hero_plan",
  "occurred_at": "2026-10-11T09:22:57.151Z"
}
```

| Event | When | `cta_id` |
|---|---|---|
| `page_view` | each page load | — |
| `cta_click` | any element with `data-cta` | `nav_plan`, `mobile_nav_plan`, `hero_plan`, `demo_plan`, `about_plan`, `footer_plan`, `404_plan` |
| `whatsapp_click` | any element with `data-whatsapp` | `hero`, `demo`, `faq`, `plan_section`, `form_error`, `about_founder`, `about_cta`, `privacy`, `footer` |
| `form_start` | first focus inside the form | — |
| `form_submit_success` | lead endpoint answered `{ ok: true }` | — |
| `form_submit_error` | lead submit failed | `request_failed`, `timeout` or `no_endpoint` |
| `scroll_75` | page scrolled 75% (once per page view) | — |

- `device` is based on viewport width: `mobile` < 768px ≤ `tablet` < 1024px ≤ `desktop`.
- `session_id` is a random UUID in `sessionStorage`. It's gone when the tab closes.
- `referrer` is filled only when it's another site.
- No cookies and no personal data in events.

## Project structure

```
astro.config.mjs         SITE_URL -> site config
src/config/site.ts       brand, WhatsApp number, nav
src/styles/global.css    design tokens + base styles
src/layouts/Base.astro   <head>/SEO/OG, header, footer, analytics
src/components/          Header, Footer, Logo, ProjectForm, DemoMockup, WhatsAppButton
src/scripts/context.ts   session id, UTM, referrer, device
src/scripts/analytics.ts first-party event tracking
src/scripts/form.ts      form validation, submission, states
src/pages/               index, about, privacy, 404, robots.txt, sitemap.xml
public/                  logo-flam.png, logo-flam-full.png, favicon.svg, og-default.png
mock/server.mjs          local mock of the Base44 intake functions
```

## Deploying later

The build is plain static files in `dist/`, so it runs on any static host (Netlify, Vercel, Cloudflare Pages, etc.). Before going live:

1. Buy the domain and set `SITE_URL`, then rebuild. This also turns indexing on.
2. Set `PUBLIC_LEAD_ENDPOINT` and `PUBLIC_ANALYTICS_ENDPOINT` to the real Base44 function URLs in the host's build settings.
3. Add the production domain to the Base44 functions' CORS allowlist.
4. Submit one real test lead and check that it appears in the Base44 dashboard together with its events.
