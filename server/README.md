# Asset Declaration – mail server

Browsers cannot call Mailtrap directly (CORS + the API token can't be exposed in
the browser), so a tiny Node relay handles sending. It talks to Mailtrap's **Email
Sending HTTP API** (`send.api.mailtrap.io/api/send`) with an API token.

On every submission the server:

1. Receives the signed PDF + form data from the browser.
2. Appends/updates the row in the running ledger (`server/data/submissions.json`).
3. Rebuilds the running Excel sheet (`Submissions` + `Asset Register` tabs).
4. POSTs to the Mailtrap API with **both** attachments (PDF + running sheet)
   addressed to `zahur@physique57mumbai.com`.
5. Only writes the row to the ledger *after* Mailtrap accepts the email, so a
   failed send can be retried without creating a duplicate row.

## Setup

1. In Mailtrap go to **Email Sending** (not the Testing sandbox):
   - Add and verify the sending domain (e.g. `physique57india.com`), completing
     all the DNS records Mailtrap asks for.
   - Create an **API token** under Settings → API Tokens for that domain.
2. `cp server/.env.example server/.env` and fill in:
   ```
   MAILTRAP_API_TOKEN=your_api_token_here
   MAILTRAP_FROM=declarations@physique57india.com   # must be on your verified domain
   # Recipient is fixed to zahur@physique57mumbai.com
   ```
3. Run:
   ```bash
   npm run build     # builds the front-end into dist/
   npm run server    # starts the server on http://localhost:3001
   # or
   npm start         # build + server in one
   ```
   The server serves the single-page app and the `/api/*` endpoints from the same
   port, so you just open http://localhost:3001 and it works.

If the app is hosted on a different origin than the server, open the ⚙ Settings
panel in the toolbar, enter the server's `/api/submit` URL, and set
`ALLOWED_ORIGIN` in `.env` to the exact origin of the page.

## Health check

`GET /api/health` returns whether the API token + sender are configured and how
many submissions are in the ledger. The Settings panel in the app has a
"Test connection" button that calls this.

## Development

Run `npm run server` and `npm run dev` in separate terminals. Vite proxies
`/api` to the server on port 3001. Keep Mailtrap secrets in `server/.env`; this
file and the submissions ledger are ignored by Git. The API token must never
use a `VITE_` prefix.

## Employee directory

`src/data/employees.json` contains only names, IDs, designations, departments
and statuses extracted from Employee View (7).csv. The selector groups the 28
active and 2 inactive entries. Inactive entries with missing job details need
those details entered explicitly; no designation is invented. Selecting a
different employee fills their details and declaration name and clears existing
signatures to prevent attributing a previous signature to another employee.

Mailtrap success means the provider accepted the email; recipient inbox
delivery is tracked through Mailtrap.

## Vercel

The root `api/submit.js` and `api/health.js` files deploy as Node.js Functions
alongside the Vite frontend. Keep the app endpoint as `/api/submit`.

In the assets-signature project, add `MAILTRAP_API_TOKEN` and `MAILTRAP_FROM`
to the Production environment (and Preview if needed), then redeploy. A
local `server/.env` is ignored and is not uploaded to Vercel.

Vercel functions do not use local disk for the submissions ledger. To retain
a shared running Excel sheet across employees, configure
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (the equivalent
`KV_REST_API_URL` / `KV_REST_API_TOKEN` names are also accepted). Records
are stored individually in a Redis hash so concurrent submissions do not
overwrite one another. An email's sheet reflects the ledger available when
that submission was processed.

Without Redis, email delivery still works and includes the signed PDF and
a sheet containing only that submission. The confirmation distinguishes
this from a shared running sheet. The local server still uses its disk ledger.

The frontend checks the JSON submission size before sending it to stay below
Vercel's function request limit. Mailtrap provider acceptance does not confirm
inbox delivery.
