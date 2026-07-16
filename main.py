from __future__ import annotations

import argparse
import base64
import calendar
import csv
import os
import re
import smtplib
import sys
from dataclasses import dataclass
from datetime import date, datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable

from email_template import EmailContent, build_email_content


# Staff note: export your renewal list as CSV (for example "ins renewal.csv" from
# the title software) and keep it in this folder, then run the tool. Always run
# --dry-run first.
DEFAULT_RECIPIENTS_FILE = Path("ins renewal.csv")
DEFAULT_SENT_LOG_FILE = Path("sent_log.csv")
SUPPORTED_PROPERTY_TYPES = {"residential", "commercial", "investment", "unknown"}
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Column layout for the real title-software export ("ins renewal.csv").
REAL_REQUIRED_COLUMNS = {
    "Borrower Full Name",
    "Borrower Email",
    "Full Address",
    "Disbursement Date",
}
# Column layout for the original demo/training template (recipients.csv).
LEGACY_REQUIRED_COLUMNS = {
    "recipient_first_name",
    "recipient_email",
    "property_address",
    "closing_date",
}
# Words that signal the borrower is a business (so we use a commercial quote and a
# generic "Hi there," greeting instead of a first name).
BUSINESS_KEYWORDS = {
    "llc",
    "inc",
    "corp",
    "company",
    "group",
    "lp",
    "llp",
    "trust",
    "properties",
    "holdings",
    "enterprises",
    "investments",
    "partners",
    "realty",
    "development",
    "homes",
    "builders",
    "construction",
    "ventures",
    "capital",
}


@dataclass(frozen=True)
class Recipient:
    first_name: str
    email: str
    property_address: str
    closing_date: date
    renewal_target_date: date | None
    renewal_month: int | None
    property_type: str
    row_number: int


@dataclass(frozen=True)
class EligibleRecipient:
    recipient: Recipient
    renewal_cycle: str
    email_content: EmailContent


@dataclass(frozen=True)
class LogEntry:
    timestamp: str
    recipient_email: str
    property_address: str
    renewal_cycle: str
    status: str
    message_id: str
    error: str


class ConfigurationError(RuntimeError):
    pass


class EmailProvider:
    def send_email(self, recipient_email: str, content: EmailContent) -> str:
        raise NotImplementedError


class DemoProvider(EmailProvider):
    """Pretend to send for demos and training. No real email is delivered."""

    def send_email(self, recipient_email: str, content: EmailContent) -> str:
        return "demo-no-email-sent"


class SmtpProvider(EmailProvider):
    """Send through an SMTP server (e.g. Microsoft 365) using an app password.

    This avoids any cloud app registration. The account owner just creates an
    app password (requires MFA) and puts it in .env as SMTP_PASSWORD.
    """

    def __init__(
        self,
        sender_email: str,
        host: str,
        port: int,
        username: str,
        password: str,
    ):
        self.sender_email = sender_email
        self.host = host
        self.port = port
        self.username = username
        self.password = password

    def send_email(self, recipient_email: str, content: EmailContent) -> str:
        message = EmailMessage()
        message["To"] = recipient_email
        message["From"] = self.sender_email
        message["Subject"] = content.subject
        message.set_content(content.text_body)
        message.add_alternative(content.html_body, subtype="html")

        try:
            with smtplib.SMTP(self.host, self.port, timeout=30) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(self.username, self.password)
                server.send_message(message)
        except smtplib.SMTPAuthenticationError as exc:
            raise ConfigurationError(
                "SMTP sign-in was rejected. Check SMTP_USERNAME and SMTP_PASSWORD "
                "(use an app password, not the normal login), and confirm your "
                "administrator allows authenticated SMTP."
            ) from exc
        except (smtplib.SMTPException, OSError) as exc:
            raise ConfigurationError(f"SMTP send failed: {exc}") from exc

        # SMTP does not return a provider message id.
        return "smtp-sent"


class GmailApiProvider(EmailProvider):
    SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

    def __init__(self, sender_email: str, credentials_file: Path, token_file: Path):
        self.sender_email = sender_email
        self.credentials_file = credentials_file
        self.token_file = token_file
        self._service = None

    def send_email(self, recipient_email: str, content: EmailContent) -> str:
        service = self._get_service()

        message = EmailMessage()
        message["To"] = recipient_email
        message["From"] = self.sender_email
        message["Subject"] = content.subject
        message.set_content(content.text_body)
        message.add_alternative(content.html_body, subtype="html")

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        response = service.users().messages().send(
            userId="me",
            body={"raw": encoded_message},
        ).execute()
        return response.get("id", "")

    def _get_service(self):
        if self._service is not None:
            return self._service

        try:
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from googleapiclient.discovery import build
        except ImportError as exc:
            raise ConfigurationError(
                "Gmail sending requires google-api-python-client, google-auth-oauthlib, and google-auth. "
                "Run 'pip install -r requirements.txt'."
            ) from exc

        if not self.credentials_file.exists():
            raise ConfigurationError(
                f"Gmail credentials file not found: {self.credentials_file}. "
                "Set GMAIL_CREDENTIALS_FILE in .env before using --send."
            )

        credentials = None
        if self.token_file.exists():
            credentials = Credentials.from_authorized_user_file(str(self.token_file), self.SCOPES)

        if not credentials or not credentials.valid:
            if credentials and credentials.expired and credentials.refresh_token:
                credentials.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(self.credentials_file),
                    self.SCOPES,
                )
                credentials = flow.run_local_server(port=0)
            self.token_file.write_text(credentials.to_json(), encoding="utf-8")

        self._service = build("gmail", "v1", credentials=credentials)
        return self._service


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send individualized monthly insurance renewal outreach emails.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview matching emails without sending them.",
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="Send matching emails one recipient at a time.",
    )
    parser.add_argument(
        "--month",
        help="Run outreach for a specific month in YYYY-MM format. Defaults to the current month.",
    )
    parser.add_argument(
        "--csv",
        default=str(DEFAULT_RECIPIENTS_FILE),
        help="Path to the recipients CSV file.",
    )
    parser.add_argument(
        "--sent-log",
        default=str(DEFAULT_SENT_LOG_FILE),
        help="Path to the sent log CSV file.",
    )

    args = parser.parse_args()
    if args.dry_run and args.send:
        parser.error("Use either --dry-run or --send, not both.")
    if not args.dry_run and not args.send:
        args.dry_run = True
    return args


def load_environment(env_path: Path = Path(".env")) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def parse_target_month(raw_value: str | None) -> date:
    if raw_value is None:
        today = date.today()
        return date(today.year, today.month, 1)

    try:
        year_text, month_text = raw_value.split("-", 1)
        return date(int(year_text), int(month_text), 1)
    except ValueError as exc:
        raise ValueError("--month must use YYYY-MM format.") from exc


def add_months(base_date: date, offset: int) -> date:
    month_index = base_date.month - 1 + offset
    year = base_date.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def safe_date(year: int, month: int, day: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def parse_date_value(raw_value: str, field_name: str) -> date:
    value = raw_value.strip()
    for date_format in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d", "%m/%d/%y"):
        try:
            return datetime.strptime(value, date_format).date()
        except ValueError:
            continue
    raise ValueError(f"{field_name} must be in YYYY-MM-DD or MM/DD/YYYY format.")


def looks_like_business(name: str) -> bool:
    tokens = {token.strip(",.").lower() for token in name.split()}
    return bool(tokens & BUSINESS_KEYWORDS)


def first_name_from(full_name: str) -> str:
    cleaned = full_name.strip()
    if not cleaned or looks_like_business(cleaned):
        return ""
    return cleaned.split()[0].strip(",.")


def first_email_from(raw_value: str) -> str:
    # Some rows list two borrowers' emails in one cell, separated by a comma or
    # semicolon. We only ever email one person, so take the first address.
    for piece in re.split(r"[;,]", raw_value):
        candidate = piece.strip()
        if candidate:
            return candidate
    return ""


def parse_optional_date(raw_value: str, field_name: str) -> date | None:
    value = raw_value.strip()
    if not value:
        return None
    return parse_date_value(value, field_name)


def parse_optional_month(raw_value: str) -> int | None:
    value = raw_value.strip()
    if not value:
        return None

    numeric = {str(index): index for index in range(1, 13)}
    numeric.update({f"{index:02d}": index for index in range(1, 13)})
    month_names = {
        "jan": 1,
        "january": 1,
        "feb": 2,
        "february": 2,
        "mar": 3,
        "march": 3,
        "apr": 4,
        "april": 4,
        "may": 5,
        "jun": 6,
        "june": 6,
        "jul": 7,
        "july": 7,
        "aug": 8,
        "august": 8,
        "sep": 9,
        "sept": 9,
        "september": 9,
        "oct": 10,
        "october": 10,
        "nov": 11,
        "november": 11,
        "dec": 12,
        "december": 12,
    }

    lowered = value.lower()
    if lowered in numeric:
        return numeric[lowered]
    if lowered in month_names:
        return month_names[lowered]
    raise ValueError("renewal_month must be 1-12 or a month name like August.")


def normalize_address(address: str) -> str:
    return " ".join(address.lower().split())


def is_valid_email(email: str) -> bool:
    return bool(EMAIL_PATTERN.match(email.strip()))


def is_valid_property_address(address: str) -> bool:
    cleaned = address.strip()
    if len(cleaned) < 8:
        return False
    if cleaned.lower() in {"unknown", "n/a", "na", "tbd"}:
        return False
    return any(character.isalpha() for character in cleaned)


def normalize_property_type(raw_value: str) -> str:
    value = raw_value.strip().lower()
    if not value:
        return "unknown"
    if value not in SUPPORTED_PROPERTY_TYPES:
        raise ValueError(
            "property_type must be residential, commercial, investment, or unknown."
        )
    return value


def excel_cell_to_text(value: object) -> str:
    """Turn one Excel cell into clean text the rest of the tool understands."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def read_excel_rows(path: Path) -> tuple[list[str] | None, list[dict[str, str]]]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise ValueError(
            "Reading Excel (.xlsx) files needs the openpyxl library. "
            "Run 'pip install -r requirements.txt', or save the file as CSV and try again."
        ) from exc

    workbook = load_workbook(filename=str(path), read_only=True, data_only=True)
    try:
        sheet = workbook.active
        rows_iter = sheet.iter_rows(values_only=True)
        try:
            header = next(rows_iter)
        except StopIteration:
            return None, []

        fieldnames = [excel_cell_to_text(cell) for cell in header]
        records: list[dict[str, str]] = []
        for raw in rows_iter:
            if all(cell is None or str(cell).strip() == "" for cell in raw):
                continue
            record = {
                name: excel_cell_to_text(raw[index] if index < len(raw) else None)
                for index, name in enumerate(fieldnames)
            }
            records.append(record)
        return fieldnames, records
    finally:
        workbook.close()


def read_table(path: Path) -> tuple[list[str] | None, list[dict[str, str]]]:
    """Read a CSV or Excel file into a header list plus row dictionaries."""
    if path.suffix.lower() in {".xlsx", ".xlsm"}:
        return read_excel_rows(path)

    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames) if reader.fieldnames else None
        rows = [dict(row) for row in reader]
    return fieldnames, rows


def load_recipients(csv_path: Path) -> tuple[list[Recipient], list[str]]:
    errors: list[str] = []
    recipients: list[Recipient] = []
    seen_keys: set[tuple[str, str]] = set()

    if not csv_path.exists():
        return [], [f"Recipients file not found: {csv_path}"]

    try:
        fieldnames, rows = read_table(csv_path)
    except ValueError as exc:
        return [], [str(exc)]

    if not fieldnames:
        return [], ["Recipients file is empty or missing a header row."]

    field_set = set(fieldnames)
    if REAL_REQUIRED_COLUMNS <= field_set:
        schema = "real"
    elif LEGACY_REQUIRED_COLUMNS <= field_set:
        schema = "legacy"
    else:
        missing_real = REAL_REQUIRED_COLUMNS - field_set
        return [], [
            "Recipients file is missing required columns: "
            + ", ".join(sorted(missing_real))
        ]

    for row_number, row in enumerate(rows, start=2):
        try:
            recipient = parse_recipient_row(row, row_number, schema)
        except ValueError as exc:
            errors.append(f"Row {row_number}: {exc}")
            continue

        duplicate_key = (
            recipient.email.lower(),
            normalize_address(recipient.property_address),
        )
        if duplicate_key in seen_keys:
            errors.append(
                f"Row {row_number}: duplicate recipient/email and property address in file."
            )
            continue
        seen_keys.add(duplicate_key)
        recipients.append(recipient)

    return recipients, errors


def parse_recipient_row(row: dict[str, str], row_number: int, schema: str = "real") -> Recipient:
    if schema == "legacy":
        return parse_legacy_recipient_row(row, row_number)
    return parse_real_recipient_row(row, row_number)


def parse_real_recipient_row(row: dict[str, str], row_number: int) -> Recipient:
    full_name = (row.get("Borrower Full Name") or "").strip()
    email = first_email_from(row.get("Borrower Email") or "")
    property_address = (row.get("Full Address") or "").strip()
    closing_date_raw = (row.get("Disbursement Date") or "").strip()

    if not full_name:
        raise ValueError("Borrower Full Name is required.")
    if not email:
        raise ValueError("Borrower Email is required.")
    if not is_valid_email(email):
        raise ValueError(f"invalid Borrower Email '{email}'.")
    if not property_address:
        raise ValueError("Full Address is required.")
    if not is_valid_property_address(property_address):
        raise ValueError(f"invalid Full Address '{property_address}'.")
    if not closing_date_raw:
        raise ValueError("Disbursement Date is required.")

    closing_date = parse_date_value(closing_date_raw, "Disbursement Date")
    property_type = "commercial" if looks_like_business(full_name) else "residential"

    return Recipient(
        first_name=first_name_from(full_name),
        email=email,
        property_address=property_address,
        closing_date=closing_date,
        renewal_target_date=None,
        renewal_month=None,
        property_type=property_type,
        row_number=row_number,
    )


def parse_legacy_recipient_row(row: dict[str, str], row_number: int) -> Recipient:
    first_name = (row.get("recipient_first_name") or "").strip()
    email = (row.get("recipient_email") or "").strip()
    property_address = (row.get("property_address") or "").strip()
    closing_date_raw = (row.get("closing_date") or "").strip()
    renewal_target_date_raw = (row.get("renewal_target_date") or "").strip()
    renewal_month_raw = (row.get("renewal_month") or "").strip()
    property_type_raw = (row.get("property_type") or "").strip()

    if not first_name:
        raise ValueError("recipient_first_name is required.")
    if not email:
        raise ValueError("recipient_email is required.")
    if not is_valid_email(email):
        raise ValueError(f"invalid recipient_email '{email}'.")
    if not property_address:
        raise ValueError("property_address is required.")
    if not is_valid_property_address(property_address):
        raise ValueError(f"invalid property_address '{property_address}'.")
    if not closing_date_raw:
        raise ValueError("closing_date is required.")

    closing_date = parse_date_value(closing_date_raw, "closing_date")
    renewal_target_date = parse_optional_date(renewal_target_date_raw, "renewal_target_date")
    renewal_month = parse_optional_month(renewal_month_raw)
    property_type = normalize_property_type(property_type_raw)

    if renewal_target_date and renewal_month and renewal_target_date.month != renewal_month:
        raise ValueError(
            "renewal_target_date and renewal_month disagree; keep one or make them match."
        )

    return Recipient(
        first_name=first_name,
        email=email,
        property_address=property_address,
        closing_date=closing_date,
        renewal_target_date=renewal_target_date,
        renewal_month=renewal_month,
        property_type=property_type,
        row_number=row_number,
    )


def load_sent_log(sent_log_path: Path) -> tuple[set[tuple[str, str, str]], list[str]]:
    sent_keys: set[tuple[str, str, str]] = set()
    warnings: list[str] = []

    if not sent_log_path.exists():
        ensure_sent_log_exists(sent_log_path)
        return sent_keys, warnings

    with sent_log_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            warnings.append("sent_log.csv is empty; a new header will be created on the next write.")
            return sent_keys, warnings

        for row_number, row in enumerate(reader, start=2):
            status = (row.get("status") or "").strip().lower()
            if status != "sent":
                continue
            recipient_email = (row.get("recipient_email") or "").strip().lower()
            property_address = normalize_address((row.get("property_address") or "").strip())
            renewal_cycle = (row.get("renewal_cycle") or "").strip()
            if not recipient_email or not property_address or not renewal_cycle:
                warnings.append(f"sent_log.csv row {row_number} is incomplete and was ignored.")
                continue
            sent_keys.add((recipient_email, property_address, renewal_cycle))

    return sent_keys, warnings


def ensure_sent_log_exists(sent_log_path: Path) -> None:
    if sent_log_path.exists():
        return
    sent_log_path.write_text(
        "timestamp,recipient_email,property_address,renewal_cycle,status,message_id,error\n",
        encoding="utf-8",
    )


def append_log_entry(sent_log_path: Path, entry: LogEntry) -> None:
    ensure_sent_log_exists(sent_log_path)
    with sent_log_path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                entry.timestamp,
                entry.recipient_email,
                entry.property_address,
                entry.renewal_cycle,
                entry.status,
                entry.message_id,
                entry.error,
            ]
        )


def build_eligible_recipients(
    recipients: Iterable[Recipient],
    target_month: date,
    sent_keys: set[tuple[str, str, str]],
) -> tuple[list[EligibleRecipient], list[str]]:
    expected_renewal_month = add_months(target_month, 2)
    eligible: list[EligibleRecipient] = []
    notices: list[str] = []

    for recipient in recipients:
        renewal_cycle = get_renewal_cycle_for_month(recipient, expected_renewal_month)
        if renewal_cycle is None:
            continue

        sent_key = (
            recipient.email.lower(),
            normalize_address(recipient.property_address),
            renewal_cycle,
        )
        if sent_key in sent_keys:
            notices.append(
                f"Skipping {recipient.email} for {renewal_cycle}: already logged as sent."
            )
            continue

        eligible.append(
            EligibleRecipient(
                recipient=recipient,
                renewal_cycle=renewal_cycle,
                email_content=build_email_content(
                    recipient.first_name,
                    recipient.property_address,
                    recipient.property_type,
                ),
            )
        )

    return eligible, notices


def get_renewal_cycle_for_month(recipient: Recipient, expected_renewal_month: date) -> str | None:
    if recipient.renewal_target_date is not None:
        if recipient.renewal_target_date.month != expected_renewal_month.month:
            return None
        cycle_date = safe_date(
            expected_renewal_month.year,
            recipient.renewal_target_date.month,
            recipient.renewal_target_date.day,
        )
        return cycle_date.isoformat()

    if recipient.renewal_month is not None:
        if recipient.renewal_month != expected_renewal_month.month:
            return None
        return f"{expected_renewal_month.year}-{expected_renewal_month.month:02d}"

    if recipient.closing_date.month != expected_renewal_month.month:
        return None

    cycle_date = safe_date(
        expected_renewal_month.year,
        recipient.closing_date.month,
        recipient.closing_date.day,
    )
    return cycle_date.isoformat()


def print_preview(target_month: date, eligible_recipients: list[EligibleRecipient]) -> None:
    if not eligible_recipients:
        print(f"No recipients matched outreach month {target_month.strftime('%Y-%m')}.")
        return

    print(
        f"Previewing {len(eligible_recipients)} email(s) for outreach month {target_month.strftime('%Y-%m')}"
    )
    print("-" * 72)

    for item in eligible_recipients:
        recipient = item.recipient
        print(f"To: {recipient.email}")
        print(f"Subject: {item.email_content.subject}")
        print(f"Renewal cycle: {item.renewal_cycle}")
        print()
        print(item.email_content.text_body)
        print("-" * 72)


def create_provider() -> EmailProvider:
    provider_name = os.environ.get("EMAIL_PROVIDER", "gmail").strip().lower()
    sender_email = os.environ.get("SENDER_EMAIL", "").strip()
    if not sender_email:
        raise ConfigurationError("SENDER_EMAIL is required in .env when using --send.")

    if provider_name in {"smtp", "office365", "outlook", "microsoft365", "m365"}:
        host = os.environ.get("SMTP_HOST", "smtp.office365.com").strip()
        port_text = os.environ.get("SMTP_PORT", "587").strip()
        try:
            port = int(port_text)
        except ValueError as exc:
            raise ConfigurationError(f"SMTP_PORT must be a number, got '{port_text}'.") from exc
        username = os.environ.get("SMTP_USERNAME", "").strip() or sender_email
        password = os.environ.get("SMTP_PASSWORD", "").strip()
        if not password:
            raise ConfigurationError(
                "SMTP_PASSWORD is required in .env for SMTP sending. "
                "Use an app password from your email account's security settings."
            )
        return SmtpProvider(sender_email, host, port, username, password)

    if provider_name != "gmail":
        raise ConfigurationError(
            f"Unsupported EMAIL_PROVIDER '{provider_name}'. Use 'smtp' (e.g. Microsoft 365) or 'gmail'."
        )

    credentials_file = Path(os.environ.get("GMAIL_CREDENTIALS_FILE", "credentials.json"))
    token_file = Path(os.environ.get("GMAIL_TOKEN_FILE", "token.json"))
    return GmailApiProvider(sender_email, credentials_file, token_file)


def send_emails(
    provider: EmailProvider,
    eligible_recipients: Iterable[EligibleRecipient],
    sent_log_path: Path,
    success_status: str = "sent",
) -> tuple[int, int]:
    sent_count = 0
    failed_count = 0

    for item in eligible_recipients:
        recipient = item.recipient

        try:
            message_id = provider.send_email(recipient.email, item.email_content)
            append_log_entry(
                sent_log_path,
                LogEntry(
                    timestamp=datetime.now().isoformat(timespec="seconds"),
                    recipient_email=recipient.email,
                    property_address=recipient.property_address,
                    renewal_cycle=item.renewal_cycle,
                    status=success_status,
                    message_id=message_id,
                    error="",
                ),
            )
            sent_count += 1
            print(
                f"{success_status.upper()}: {recipient.email} | {item.email_content.subject} | cycle {item.renewal_cycle}"
            )
        except Exception as exc:  # noqa: BLE001
            append_log_entry(
                sent_log_path,
                LogEntry(
                    timestamp=datetime.now().isoformat(timespec="seconds"),
                    recipient_email=recipient.email,
                    property_address=recipient.property_address,
                    renewal_cycle=item.renewal_cycle,
                    status="failed",
                    message_id="",
                    error=str(exc),
                ),
            )
            failed_count += 1
            print(
                f"FAILED: {recipient.email} | {item.email_content.subject} | cycle {item.renewal_cycle} | {exc}",
                file=sys.stderr,
            )

    return sent_count, failed_count


def main() -> int:
    args = parse_args()
    load_environment()

    csv_path = Path(args.csv)
    sent_log_path = Path(args.sent_log)

    try:
        target_month = parse_target_month(args.month)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    recipients, recipient_errors = load_recipients(csv_path)
    sent_keys, sent_log_warnings = load_sent_log(sent_log_path)

    for message in recipient_errors:
        print(f"ERROR: {message}", file=sys.stderr)
    for message in sent_log_warnings:
        print(f"WARNING: {message}", file=sys.stderr)

    eligible_recipients, notices = build_eligible_recipients(recipients, target_month, sent_keys)
    for message in notices:
        print(f"NOTICE: {message}")

    if args.dry_run:
        print_preview(target_month, eligible_recipients)
        print(
            f"Dry run complete. Matched {len(eligible_recipients)} recipient(s); "
            f"{len(recipient_errors)} row error(s) found."
        )
        return 0

    if recipient_errors:
        print("Fix CSV errors before sending live emails.", file=sys.stderr)
        return 1

    if not eligible_recipients:
        print(f"No recipients matched outreach month {target_month.strftime('%Y-%m')}.")
        return 0

    try:
        provider = create_provider()
    except ConfigurationError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    sent_count, failed_count = send_emails(provider, eligible_recipients, sent_log_path)
    print(
        f"Finished send run for {target_month.strftime('%Y-%m')}: "
        f"sent={sent_count}, failed={failed_count}."
    )
    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())