/**
 * sendEmail.ts
 * Sends emails via SMTP (Microsoft 365 / Outlook) using nodemailer.
 * All credentials are read from environment variables set in .env.local.
 */

import nodemailer from "nodemailer";
import type { EligibleRecipient, SendResult } from "@/types";

function createTransporter() {
  const host = process.env.SMTP_HOST ?? "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const username = process.env.SMTP_USERNAME ?? process.env.SENDER_EMAIL ?? "";
  const password = process.env.SMTP_PASSWORD ?? "";
  const senderEmail = process.env.SENDER_EMAIL ?? username;

  if (!password) {
    throw new Error(
      "SMTP_PASSWORD is not set. Add it to .env.local (use an app password, not your normal login password)."
    );
  }
  if (!senderEmail) {
    throw new Error("SENDER_EMAIL is not set in .env.local.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS on port 587
    auth: { user: username, pass: password },
    tls: { ciphers: "SSLv3" },
    pool: true,
    maxConnections: 5,
  });

  return { transporter, senderEmail };
}

export async function sendEmails(
  recipients: EligibleRecipient[]
): Promise<SendResult> {
  const { transporter, senderEmail } = createTransporter();

  const results = await Promise.allSettled(
    recipients.map((item) =>
      transporter.sendMail({
        from: senderEmail,
        to: item.recipient.email,
        subject: item.emailContent.subject,
        text: item.emailContent.textBody,
        html: item.emailContent.htmlBody,
      })
    )
  );

  transporter.close();

  let sent = 0;
  const failed: SendResult["failed"] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      sent++;
    } else {
      failed.push({
        email: recipients[i].recipient.email,
        address: recipients[i].recipient.propertyAddress,
        error: (result.reason as Error).message,
      });
    }
  }

  return { sent, failed };
}
