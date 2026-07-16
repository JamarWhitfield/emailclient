/**
 * parseRecipients.ts
 * Ports the Python main.py parsing logic to TypeScript.
 * Accepts a raw file buffer (CSV or XLSX/XLSM) plus a target month string
 * and returns eligible recipients ready for email preview/sending.
 */

import * as XLSX from "xlsx";
import { buildEmailContent } from "./emailTemplate";
import type { EligibleRecipient, ParseResult, Recipient } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REAL_REQUIRED_COLUMNS = new Set([
  "Borrower Full Name",
  "Borrower Email",
  "Full Address",
  "Disbursement Date",
]);

const LEGACY_REQUIRED_COLUMNS = new Set([
  "recipient_first_name",
  "recipient_email",
  "property_address",
  "closing_date",
]);

const BUSINESS_KEYWORDS = new Set([
  "llc", "inc", "corp", "company", "group", "lp", "llp", "trust",
  "properties", "holdings", "enterprises", "investments", "partners",
  "realty", "development", "homes", "builders", "construction",
  "ventures", "capital",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

function addMonths(base: Date, offset: number): Date {
  const result = new Date(base);
  result.setMonth(result.getMonth() + offset);
  return result;
}

function safeDate(year: number, month: number, day: number): Date {
  // month is 1-based
  const lastDay = new Date(year, month, 0).getDate(); // day=0 → last day of prev month
  return new Date(year, month - 1, Math.min(day, lastDay));
}

function parseDate(raw: string, fieldName: string): Date {
  const value = raw.trim();
  const formats: RegExp[] = [
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, // MM/DD/YY
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, // YYYY/MM/DD
  ];

  for (const fmt of formats) {
    const m = value.match(fmt);
    if (!m) continue;

    let year: number, month: number, day: number;

    if (fmt === formats[0] || fmt === formats[3]) {
      // YYYY first
      [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    } else if (fmt === formats[2]) {
      // MM/DD/YY — treat YY as 2000s
      year = 2000 + Number(m[3]);
      [month, day] = [Number(m[1]), Number(m[2])];
    } else {
      // MM/DD/YYYY
      [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    }

    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }

  throw new Error(`${fieldName} must be in YYYY-MM-DD or MM/DD/YYYY format (got "${value}").`);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Name / email helpers
// ---------------------------------------------------------------------------

const BUSINESS_KEYWORDS_ARRAY = Array.from(BUSINESS_KEYWORDS);

function looksLikeBusiness(name: string): boolean {
  const tokens = new Set(name.split(/\s+/).map((t) => t.replace(/[,.]/g, "").toLowerCase()));
  return BUSINESS_KEYWORDS_ARRAY.some((kw) => tokens.has(kw));
}

function firstNameFrom(fullName: string): string {
  const cleaned = fullName.trim();
  if (!cleaned || looksLikeBusiness(cleaned)) return "";
  return cleaned.split(/\s+/)[0].replace(/[,.]$/, "");
}

function firstEmailFrom(raw: string): string {
  for (const piece of raw.split(/[;,]/)) {
    const c = piece.trim();
    if (c) return c;
  }
  return "";
}

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

function isValidAddress(address: string): boolean {
  const cleaned = address.trim();
  if (cleaned.length < 8) return false;
  if (["unknown", "n/a", "na", "tbd"].includes(cleaned.toLowerCase())) return false;
  return /[a-zA-Z]/.test(cleaned);
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Row parsers
// ---------------------------------------------------------------------------

function parseRealRow(row: Record<string, string>, rowNumber: number): Recipient {
  const fullName = (row["Borrower Full Name"] ?? "").trim();
  const rawEmail = row["Borrower Email"] ?? "";
  const email = firstEmailFrom(rawEmail);
  const propertyAddress = (row["Full Address"] ?? "").trim();
  const closingDateRaw = (row["Disbursement Date"] ?? "").trim();

  if (!fullName) throw new Error("Borrower Full Name is required.");
  if (!email) throw new Error("Borrower Email is required.");
  if (!isValidEmail(email)) throw new Error(`Invalid Borrower Email "${email}".`);
  if (!propertyAddress) throw new Error("Full Address is required.");
  if (!isValidAddress(propertyAddress)) throw new Error(`Invalid Full Address "${propertyAddress}".`);
  if (!closingDateRaw) throw new Error("Disbursement Date is required.");

  const closingDate = parseDate(closingDateRaw, "Disbursement Date");

  return {
    firstName: firstNameFrom(fullName),
    email,
    propertyAddress,
    closingDate: toIso(closingDate),
    renewalTargetDate: null,
    renewalMonth: null,
    propertyType: looksLikeBusiness(fullName) ? "commercial" : "residential",
    rowNumber,
  };
}

function parseOptionalMonth(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  const n = parseInt(value, 10);
  if (!isNaN(n) && n >= 1 && n <= 12) return n;

  const named = monthNames[value.toLowerCase()];
  if (named) return named;

  throw new Error("renewal_month must be 1–12 or a month name like August.");
}

function normalizePropType(
  raw: string
): "residential" | "commercial" | "investment" | "unknown" {
  const value = raw.trim().toLowerCase();
  if (!value) return "unknown";
  if (["residential", "commercial", "investment", "unknown"].includes(value))
    return value as "residential" | "commercial" | "investment" | "unknown";
  throw new Error(
    `property_type must be residential, commercial, investment, or unknown (got "${raw}").`
  );
}

function parseLegacyRow(row: Record<string, string>, rowNumber: number): Recipient {
  const firstName = (row["recipient_first_name"] ?? "").trim();
  const email = (row["recipient_email"] ?? "").trim();
  const propertyAddress = (row["property_address"] ?? "").trim();
  const closingDateRaw = (row["closing_date"] ?? "").trim();
  const renewalTargetDateRaw = (row["renewal_target_date"] ?? "").trim();
  const renewalMonthRaw = (row["renewal_month"] ?? "").trim();
  const propertyTypeRaw = (row["property_type"] ?? "").trim();

  if (!firstName) throw new Error("recipient_first_name is required.");
  if (!email) throw new Error("recipient_email is required.");
  if (!isValidEmail(email)) throw new Error(`Invalid recipient_email "${email}".`);
  if (!propertyAddress) throw new Error("property_address is required.");
  if (!isValidAddress(propertyAddress)) throw new Error(`Invalid property_address "${propertyAddress}".`);
  if (!closingDateRaw) throw new Error("closing_date is required.");

  const closingDate = parseDate(closingDateRaw, "closing_date");
  const renewalTargetDate = renewalTargetDateRaw
    ? toIso(parseDate(renewalTargetDateRaw, "renewal_target_date"))
    : null;
  const renewalMonth = parseOptionalMonth(renewalMonthRaw);
  const propertyType = normalizePropType(propertyTypeRaw);

  if (
    renewalTargetDate &&
    renewalMonth !== null &&
    new Date(renewalTargetDate).getMonth() + 1 !== renewalMonth
  ) {
    throw new Error(
      "renewal_target_date and renewal_month disagree; keep one or make them match."
    );
  }

  return {
    firstName,
    email,
    propertyAddress,
    closingDate: toIso(closingDate),
    renewalTargetDate,
    renewalMonth,
    propertyType,
    rowNumber,
  };
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

function readTableFromBuffer(
  buffer: Buffer,
  filename: string
): { fieldnames: string[]; rows: Record<string, string>[] } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  let workbook: XLSX.WorkBook;

  if (ext === "csv") {
    // Force text parsing to avoid XLSX auto-converting dates
    workbook = XLSX.read(buffer, { type: "buffer", raw: true, cellDates: false });
  } else {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rawRows.length === 0) return { fieldnames: [], rows: [] };

  const fieldnames = (rawRows[0] as unknown[]).map((v) => String(v ?? "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i] as unknown[];
    // Skip entirely blank rows
    if (raw.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;

    const record: Record<string, string> = {};
    for (let j = 0; j < fieldnames.length; j++) {
      const cell = raw[j];
      // Convert XLSX date objects back to ISO strings
      if (cell instanceof Date) {
        record[fieldnames[j]] = toIso(cell);
      } else {
        record[fieldnames[j]] = String(cell ?? "").trim();
      }
    }
    rows.push(record);
  }

  return { fieldnames, rows };
}

// ---------------------------------------------------------------------------
// Renewal cycle matching (mirrors get_renewal_cycle_for_month in main.py)
// ---------------------------------------------------------------------------

function getRenewalCycle(recipient: Recipient, expectedRenewalMonth: Date): string | null {
  const expYear = expectedRenewalMonth.getFullYear();
  const expMonth = expectedRenewalMonth.getMonth() + 1; // 1-based

  if (recipient.renewalTargetDate) {
    const rtd = new Date(recipient.renewalTargetDate);
    if (rtd.getMonth() + 1 !== expMonth) return null;
    return toIso(safeDate(expYear, rtd.getMonth() + 1, rtd.getDate()));
  }

  if (recipient.renewalMonth !== null) {
    if (recipient.renewalMonth !== expMonth) return null;
    return `${expYear}-${String(expMonth).padStart(2, "0")}`;
  }

  const closing = new Date(recipient.closingDate);
  if (closing.getMonth() + 1 !== expMonth) return null;
  return toIso(safeDate(expYear, closing.getMonth() + 1, closing.getDate()));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Parse a CSV or Excel file buffer into eligible email recipients.
 *
 * @param fileBuffer  Raw file bytes.
 * @param filename    Original filename (used to detect CSV vs. Excel).
 * @param targetMonth "YYYY-MM" string for the outreach month (defaults to current month).
 * @param sentKeys    Set of "email|address|cycle" strings already logged as sent.
 */
export function parseRecipients(
  fileBuffer: Buffer,
  filename: string,
  targetMonth: string,
  sentKeys: Set<string> = new Set()
): ParseResult {
  const errors: string[] = [];
  const skippedAlreadySent: string[] = [];

  // Parse target month
  const [yearStr, monthStr] = targetMonth.split("-");
  const targetDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  const expectedRenewalMonth = addMonths(targetDate, 2);

  // Read file
  let fieldnames: string[];
  let rows: Record<string, string>[];
  try {
    ({ fieldnames, rows } = readTableFromBuffer(fileBuffer, filename));
  } catch (err) {
    return {
      eligible: [],
      errors: [`Failed to read file: ${(err as Error).message}`],
      skippedAlreadySent: [],
      totalRows: 0,
    };
  }

  if (fieldnames.length === 0) {
    return {
      eligible: [],
      errors: ["File is empty or missing a header row."],
      skippedAlreadySent: [],
      totalRows: 0,
    };
  }

  const fieldSet = new Set(fieldnames);
  let schema: "real" | "legacy";

  const hasAllReal = Array.from(REAL_REQUIRED_COLUMNS).every((c) => fieldSet.has(c));
  const hasAllLegacy = Array.from(LEGACY_REQUIRED_COLUMNS).every((c) => fieldSet.has(c));

  if (hasAllReal) {
    schema = "real";
  } else if (hasAllLegacy) {
    schema = "legacy";
  } else {
    const missing = Array.from(REAL_REQUIRED_COLUMNS).filter((c) => !fieldSet.has(c));
    return {
      eligible: [],
      errors: [`File is missing required columns: ${missing.join(", ")}`],
      skippedAlreadySent: [],
      totalRows: rows.length,
    };
  }

  // Parse rows
  const recipients: Recipient[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // 1-based header + 1
    try {
      const recipient =
        schema === "real"
          ? parseRealRow(rows[i], rowNumber)
          : parseLegacyRow(rows[i], rowNumber);

      const dupKey = `${recipient.email.toLowerCase()}|${normalizeAddress(recipient.propertyAddress)}`;
      if (seenKeys.has(dupKey)) {
        errors.push(`Row ${rowNumber}: duplicate email and address — skipped.`);
        continue;
      }
      seenKeys.add(dupKey);
      recipients.push(recipient);
    } catch (err) {
      errors.push(`Row ${rowNumber}: ${(err as Error).message}`);
    }
  }

  // Build eligible list
  const eligible: EligibleRecipient[] = [];

  for (const recipient of recipients) {
    const renewalCycle = getRenewalCycle(recipient, expectedRenewalMonth);
    if (renewalCycle === null) continue;

    const sentKey = `${recipient.email.toLowerCase()}|${normalizeAddress(recipient.propertyAddress)}|${renewalCycle}`;
    if (sentKeys.has(sentKey)) {
      skippedAlreadySent.push(
        `${recipient.email} (${recipient.propertyAddress}) — already sent for ${renewalCycle}`
      );
      continue;
    }

    eligible.push({
      recipient,
      renewalCycle,
      emailContent: buildEmailContent(
        recipient.firstName,
        recipient.propertyAddress,
        recipient.propertyType
      ),
    });
  }

  return {
    eligible,
    errors,
    skippedAlreadySent,
    totalRows: rows.length,
  };
}
