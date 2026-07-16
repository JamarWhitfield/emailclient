# Fleur De Lis Insurance Renewal Outreach Tool

This is a small local Python tool that helps staff send one insurance-renewal outreach email at a time. It reads a CSV export, finds the people whose renewal month is about two months away, previews each email in dry-run mode, and logs each successful send so the same renewal cycle is not emailed twice.

## Recommended architecture

- `main.py` handles CSV loading, validation, date filtering, dry-run previews, sent-log checks, and provider selection.
- `email_template.py` builds the reusable plain-text and HTML email body.
- The email sender is isolated behind a small provider interface so Gmail can be used now and Microsoft Graph can be added later without rewriting the matching logic.

## Desktop app for staff (no Terminal needed)

Non-technical staff can use the point-and-click app instead of the command line.

How to open it:

1. In Finder, go to this folder.
2. Double-click `run_app.command`.
3. The first time only, you may need to right-click it, choose Open, then Open again to allow it.

How to use it:

1. Confirm the outreach month at the top (it defaults to the current month, format `YYYY-MM`).
2. Click `Preview`. This is always safe and never sends anything.
3. Review the matched recipients on the left and read each email on the right.
4. Fix anything listed under "Problems found in recipients file" by editing `recipients.csv`, then click `Preview` again.
5. Click `Send Emails`, then type `SEND` to confirm. Sending is blocked until you preview first and confirm.

The app reuses the same logic, sent-log, and safety checks as the command line tool, so previews and sends behave identically.

Note on Python and Tk: the app needs a Python that includes Tk (the windowing
library). The launcher automatically finds a compatible Python. On macOS with
Homebrew, if it reports that Tk is missing, install it once with
`brew install python-tk@3.11` and then reopen `run_app.command`.

## What the tool does

- Reads recipients from `recipients.csv`.
- Uses `renewal_target_date`, `renewal_month`, or the `closing_date` anniversary to decide who should be contacted.
- Sends one separate email per recipient.
- Uses the property address as the email subject line.
- Supports a safe preview mode with `--dry-run`.
- Logs sent and failed attempts in `sent_log.csv`.
- Uses environment variables for provider settings and credentials.

## Files

- `main.py`: command-line script and Gmail integration.
- `app.py`: point-and-click desktop app for staff.
- `run_app.command`: double-click launcher for the desktop app on macOS.
- `email_template.py`: the reusable outreach message template.
- `recipients.csv`: staff-managed recipient list.
- `sent_log.csv`: keeps a record of sent and failed attempts.
- `.env.example`: example environment configuration.
- `requirements.txt`: Python dependencies for live Gmail sending.

## Quick start

1. Install Python 3.11 or newer.
2. Open a terminal in this folder.
3. Create a virtual environment if you want one:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

4. Install dependencies:

```bash
pip install -r requirements.txt
```

5. Copy `.env.example` to `.env` and fill in the values.
6. Update `recipients.csv` with the people who should receive outreach.
7. Run a dry run first:

```bash
python3 main.py --dry-run
```

8. If the preview looks correct, run the live send:

```bash
python3 main.py --send
```

## Staff instructions for updating the CSV

Open `recipients.csv` in Excel, Google Sheets, or Numbers and keep the header row exactly as it is. After editing, export or save the file as CSV before running the script.

Required columns:

- `recipient_first_name`
- `recipient_email`
- `property_address`
- `closing_date`

Optional columns:

- `renewal_target_date`: exact renewal date if known.
- `renewal_month`: month number like `08` or name like `August`.
- `property_type`: `residential`, `commercial`, `investment`, or `unknown`.

Notes for staff:

- If `renewal_target_date` is blank, the tool uses `renewal_month`.
- If both renewal fields are blank, the tool falls back to the `closing_date` anniversary month.
- Keep one row per recipient and property combination.
- The script skips rows with missing emails, invalid emails, invalid addresses, duplicate rows, or invalid dates.

## Running for a specific month

Use `--month YYYY-MM` to run the batch for a specific outreach month.

Example: to contact people whose renewal is expected about two months after June 2026:

```bash
python3 main.py --dry-run --month 2026-06
```

When the preview is correct:

```bash
python3 main.py --send --month 2026-06
```

## How the matching works

The tool treats the selected month as the outreach month and looks two months ahead for the renewal cycle.

Examples:

- `--month 2026-06` matches August renewals.
- `--month 2026-11` matches January renewals.

Priority order for matching:

1. `renewal_target_date`
2. `renewal_month`
3. `closing_date` anniversary month

## Gmail setup

This prototype ships with Gmail API support because the sender should appear as Kellie directly. To make that work safely:

1. Create a Google Cloud project.
2. Enable the Gmail API.
3. Create OAuth client credentials for a Desktop app.
4. Download the credentials JSON file and store it locally as `credentials.json`, or point `GMAIL_CREDENTIALS_FILE` to its path.
5. Set `SENDER_EMAIL` to Kellie's Google Workspace email address.
6. Run `python3 main.py --send` once and sign in as Kellie when the browser opens.
7. The tool creates `token.json` locally after authorization.

Important:

- Use Kellie's own Google Workspace account, or a delegated mailbox that is allowed to send as Kellie.
- Do not commit `.env`, `credentials.json`, or `token.json`.
- The script sends one message per recipient and never puts multiple contacts in `To`, `CC`, or `BCC`.

## Sent log behavior

`sent_log.csv` stores:

- timestamp
- recipient email
- property address
- renewal cycle
- status
- provider message ID
- error text for failed sends

Only rows with `status=sent` block duplicates for the same recipient, address, and renewal cycle.

## Typical monthly workflow

1. Update `recipients.csv`.
2. Run `python3 main.py --dry-run`.
3. Review the preview in the terminal.
4. Run `python3 main.py --send`.
5. Keep `sent_log.csv` with the project files so future runs skip already-sent cycles.

## Extending providers later

The sending logic is isolated in `main.py` so the Gmail provider can be swapped for Microsoft Graph later if the office standard is Outlook or Microsoft 365.