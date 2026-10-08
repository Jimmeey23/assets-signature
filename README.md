# Physique 57 asset declarations

Employee asset declarations with server-generated PDFs, Mailtrap email sending, and a Redis-backed admin center.

## Run

Install with `npm install`, copy `server/.env.example` to `server/.env`, configure the server variables, and run `npm start`. `npm test` verifies the email and signing workflows using mocked providers. `npm run build` builds the frontend.

## Admin center

Open `/#/admin` and enter the server-configured `ADMIN_CODE`. Access uses an eight-hour HttpOnly session with code-attempt limits. Redis credentials and the access code stay on the server.

Create a declaration, set its assets, and sign Handed Over By and Admin / Operations Verification. Choose employees and confirm their business email addresses in Bulk recipients to send personalized PDFs and private signing links. Invitations expire after 30 days; admins can resend an invitation to issue a fresh link.

Recipients review the assigned document, add only their employee signature, and submit. Assigned terms, employee details, and admin signatures are preserved by the server. Signed submissions are saved before email notification. Admins can also countersign employee submissions and email completed PDFs to chosen recipients.

The shared dashboard refreshes every five seconds and shows signatures, invitation opens, submissions, and email outcomes. Accepted means Mailtrap accepted the message, not confirmed inbox delivery. Failed messages remain visible and retryable. Download shared submission data with the sheet export.

Historical ledger entries remain visible. Entries created before full document storage have no recoverable signature images or PDF in Redis; use their originally emailed copy.

## Vercel

Deploy the repository with the Vite preset. Root `api/` functions provide the submission, invitation, admin, and health endpoints. Configure `ADMIN_CODE`, `APP_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `MAILTRAP_API_TOKEN`, and a verified `MAILTRAP_FROM` in the deployment environment, then redeploy. Upstash REST variable names are also supported. Use the writable Redis token, not its read-only token.

Never commit `.env` files. Employee directory data includes only workplace identity, role, department, employment status and business email.
