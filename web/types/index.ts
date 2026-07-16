export interface EmailContent {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export interface Recipient {
  firstName: string;
  email: string;
  propertyAddress: string;
  closingDate: string; // ISO date YYYY-MM-DD
  renewalTargetDate: string | null;
  renewalMonth: number | null;
  propertyType: "residential" | "commercial" | "investment" | "unknown";
  rowNumber: number;
}

export interface EligibleRecipient {
  recipient: Recipient;
  renewalCycle: string;
  emailContent: EmailContent;
}

export interface ParseResult {
  eligible: EligibleRecipient[];
  errors: string[];
  skippedAlreadySent: string[];
  totalRows: number;
}

export interface SendRequest {
  recipients: EligibleRecipient[];
}

export interface SendResult {
  sent: number;
  failed: { email: string; address: string; error: string }[];
}
