# City Pulse — NYC 311

A working prototype for exploring NYC 311 requests, submitting a resident report with a photo, and reviewing reports in an agency-style workspace.

**Live site:** https://nyc-311-city-pulse.tewan-p1.chatgpt.site

## Features

- Public NYC 311 map explorer with category, borough, status, and date filters.
- Signed-in resident reporting with a map pin and optional JPG, PNG, or WebP photo (5 MB maximum).
- Persistent reports in Cloudflare D1 and protected photos in R2.
- My Reports and issue detail pages with status history.
- Reviewer-only queue and New / Reviewing / Resolved status updates.
- Live nearby NYC 311 searches by category, radius (250–1,000 meters), and time window (7–90 days).
- User-confirmed links to official NYC requests, saved source snapshots, and on-demand official status lookups.

Reports submitted here are City Pulse records, not official NYC 311 complaints. Reviewer actions simulate an agency workflow and do not modify NYC records. AI photo analysis and priority scoring are not implemented yet.

## Stack

React, TypeScript, Vinext/Vite, Cloudflare Workers, D1, R2, Drizzle migrations, and Leaflet/OpenStreetMap. Hosted authentication is supplied by Sites.

## Local development

Requires Node.js 22.13 or newer and npm.

```sh
npm run install:ci
npm run build
```

Create an ignored `.dev.vars` file for local reviewer access:

```dotenv
REVIEWER_EMAIL=seedy@sites.test
```

Apply each migration once, in order, to the local database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_naive_stephen_strange.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_stormy_hobgoblin.sql
npm run dev -- --port 5173 --hostname 127.0.0.1
```

Local sign-in uses the starter's loopback-only test account. Hosted sign-in uses Sites identity. The production reviewer email is a server-side environment variable; do not put it in client code.

## Checks

```sh
npx tsc --noEmit
npm run build
```

## Source layout

- `app/portal.tsx`: resident and reviewer interface.
- `app/matches.tsx`: nearby matches and linked official request display.
- `app/api/reports/[[...path]]/route.ts`: authorization, reports, uploads, status updates, and matching endpoints.
- `lib/nyc311.ts`: NYC Open Data queries and distance calculations.
- `db/schema.ts`, `drizzle/`: database schema and migrations.
- `public/explore/`: existing public map explorer and its bundled public-data snapshot.
- `public/picker.html`: report-location picker.
- `.openai/hosting.json`: existing Sites project and storage binding configuration.

## Deployment and data

The current deployment is managed by Sites. GitHub stores source; pushing to GitHub does not deploy automatically. Preserve the existing Sites project identifier when updating this deployment. A different deployment needs its own hosting configuration, storage, and trusted authentication integration.

Secrets, local database contents, uploaded resident photos, dependency directories, and generated builds are excluded from version control. Hosted records and photos are not part of this repository.

The map explorer initially shows a bundled sample of 2,000 geolocated NYC requests. Submission matching queries the live `erm2-nwe9` dataset, considers up to 100 newest results within the selected filters, and presents up to 8 nearby candidates. Data may lag real-world conditions. The `Other` category searches all official issue types.

Official dataset: https://data.cityofnewyork.us/d/erm2-nwe9

Third-party components retain their respective licenses. No additional project-wide license has been selected.
