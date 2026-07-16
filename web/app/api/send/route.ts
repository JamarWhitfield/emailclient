import { NextRequest, NextResponse } from "next/server";
import { sendEmails } from "@/lib/sendEmail";
import type { EligibleRecipient } from "@/types";

export async function POST(request: NextRequest) {
  let body: { recipients: EligibleRecipient[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { recipients } = body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json(
      { error: "recipients must be a non-empty array." },
      { status: 400 }
    );
  }

  // Basic input sanitization: strip to expected shape
  const sanitized: EligibleRecipient[] = recipients.map((r) => ({
    recipient: {
      firstName: String(r.recipient?.firstName ?? ""),
      email: String(r.recipient?.email ?? ""),
      propertyAddress: String(r.recipient?.propertyAddress ?? ""),
      closingDate: String(r.recipient?.closingDate ?? ""),
      renewalTargetDate: r.recipient?.renewalTargetDate
        ? String(r.recipient.renewalTargetDate)
        : null,
      renewalMonth: r.recipient?.renewalMonth != null
        ? Number(r.recipient.renewalMonth)
        : null,
      propertyType: (["residential", "commercial", "investment", "unknown"].includes(
        r.recipient?.propertyType
      )
        ? r.recipient.propertyType
        : "unknown") as EligibleRecipient["recipient"]["propertyType"],
      rowNumber: Number(r.recipient?.rowNumber ?? 0),
    },
    renewalCycle: String(r.renewalCycle ?? ""),
    emailContent: {
      subject: String(r.emailContent?.subject ?? ""),
      textBody: String(r.emailContent?.textBody ?? ""),
      htmlBody: String(r.emailContent?.htmlBody ?? ""),
    },
  }));

  try {
    const result = await sendEmails(sanitized);
    return NextResponse.json(result);
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
