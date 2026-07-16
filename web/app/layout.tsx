import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fleur De Lis Renewal Outreach",
  description: "Insurance renewal email tool — Fleur De Lis Law & Title",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
