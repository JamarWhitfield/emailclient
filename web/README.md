# Fleur De Lis Renewal Outreach — Web App

A Next.js/Vercel version of the desktop outreach tool.

## Setup

```bash
cd web
npm install
cp .env.local.example .env.local
# Edit .env.local with your SMTP app password
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Description |
|----------|-------------|
| `SENDER_EMAIL` | The From address (e.g. `kellie@fdltitle.com`) |
| `SMTP_HOST` | SMTP server (`smtp.office365.com` for M365) |
| `SMTP_PORT` | SMTP port (`587` for STARTTLS) |
| `SMTP_USERNAME` | Usually the same as `SENDER_EMAIL` |
| `SMTP_PASSWORD` | **App password** (not your login password). Requires MFA enabled. |

## Deploying to Vercel

1. Push this `web/` folder to a GitHub repo (or a monorepo).
2. Create a new Vercel project and set the root directory to `web/`.
3. Add all env vars from `.env.local.example` in the Vercel dashboard under **Settings → Environment Variables**.
4. Deploy.

> **Note:** Vercel hobby-tier functions have a 10-second max execution time.
> For large batches (50+ emails), upgrade to Vercel Pro (60-second limit) or
> consider sending in smaller chunks. Emails are sent in parallel so typical
> batches of 20–30 complete well within 10 seconds.

## Workflow

1. **Upload** your `ins renewal.csv` (or Excel export) and choose the outreach month.
2. **Preview** — the app parses the file and shows every eligible recipient with a per-email preview button.
3. **Send** — type `SEND` to confirm. Emails go out in parallel over SMTP.

Both the real title-software CSV format (`Borrower Full Name`, `Borrower Email`, `Full Address`, `Disbursement Date`) and the legacy template format are auto-detected.
