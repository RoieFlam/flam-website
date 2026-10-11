# AGENTS.md: FLAM website v2

Instructions for coding agents (Codex and others) working on this project.

## What this is
The FLAM marketing website: Astro 7, static output, plain CSS, vanilla TypeScript. The design and copy are approved by the owner (Roie Flam). The next job is the backend: the endpoints that receive the "Plan your project" form and the first-party analytics events, and the internal dashboard that shows them.

## Run
```bash
nvm use            # Node 22 (see .nvmrc; Node >= 22.12)
npm ci
npm run mock       # local mock of the two backend functions on :8787
cp .env.example .env   # then uncomment the two mock endpoint lines
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
```

## Backend contract
The site expects two endpoints, set by env vars at build time:
- `PUBLIC_LEAD_ENDPOINT`: receives the form as JSON (`submitLead`).
- `PUBLIC_ANALYTICS_ENDPOINT`: receives events as a `text/plain` body containing JSON, because the site sends them with `navigator.sendBeacon` (`trackEvent`). The backend must parse the raw body as JSON.

The exact request and response shapes, validation rules, CORS allowlist and honeypot behaviour are in `README.md` under "Integration contract". `mock/server.mjs` is a working reference implementation of both endpoints. Keep the real backend compatible with it, or change the site and the README together.

The domain is a single value, `SITE_URL`. While it is empty every page is `noindex` and robots.txt disallows everything. Add the production domain to the backend CORS allowlist when it's chosen.

## Rules
- Never put API keys, tokens or other secrets in frontend code or in any `PUBLIC_*` variable. Secrets live only on the backend.
- Don't redesign the site or rewrite copy unless Roie asks. The rules below are Roie's decisions:
  - FLAM sells a complete digital presence. Don't describe it as "website + app" or split it into separate products.
  - No prices, and no "founding client" or "first 2–3 clients" offer.
  - Never name the tools or platforms behind the product anywhere visible (pages, meta tags, FAQ, demo, privacy notice). Developer docs like this file and the README are fine.
  - WhatsApp appears only in the bottom banner of every page (`#contact` in `Footer.astro`), as a proper button with the WhatsApp icon. It never goes next to "Plan your project".
  - Section eyebrows show titles only, with no numbers.
- Analytics events must not include personal data. The site sets no cookies.
- Keep the site accessible: labelled fields, visible focus, one H1 per page, no horizontal scroll down to 340px.
