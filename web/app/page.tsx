"use client";

import { useState, useRef } from "react";
import type { EligibleRecipient, ParseResult, SendResult } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function friendlyMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmailPreviewModal({
  item,
  onClose,
}: {
  item: EligibleRecipient;
  onClose: () => void;
}) {
  const [showHtml, setShowHtml] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Email Preview</p>
            <p className="mt-0.5 font-semibold text-gray-900">{item.recipient.email}</p>
            <p className="text-sm text-gray-500">Subject: {item.emailContent.subject}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setShowHtml(false)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                !showHtml
                  ? "bg-green-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Plain Text
            </button>
            <button
              onClick={() => setShowHtml(true)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                showHtml
                  ? "bg-green-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              HTML
            </button>
          </div>

          {showHtml ? (
            <div
              className="prose prose-sm max-w-none rounded border bg-gray-50 p-4"
              dangerouslySetInnerHTML={{ __html: item.emailContent.htmlBody }}
            />
          ) : (
            <pre className="whitespace-pre-wrap rounded border bg-gray-50 p-4 text-sm text-gray-800">
              {item.emailContent.textBody}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Step = "upload" | "preview" | "sent";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(todayMonth());
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<EligibleRecipient | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step 1: Parse / Preview ──────────────────────────────────────────────

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("month", month);

      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const data = (await res.json()) as ParseResult & { error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? "Unexpected error parsing file.");
        setLoading(false);
        return;
      }

      setParseResult(data);
      setStep("preview");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Send ─────────────────────────────────────────────────────────

  async function handleSend() {
    if (!parseResult || confirmText !== "SEND") return;
    setShowConfirm(false);
    setConfirmText("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: parseResult.eligible }),
      });
      const data = (await res.json()) as SendResult & { error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? "Unexpected error sending emails.");
        setLoading(false);
        return;
      }

      setSendResult(data);
      setStep("sent");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function reset() {
    setStep("upload");
    setFile(null);
    setParseResult(null);
    setSendResult(null);
    setError(null);
    setConfirmText("");
    setShowConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      {/* Header */}
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-green-800">
            Fleur De Lis Renewal Outreach
          </h1>
          <p className="mt-1 text-gray-500">
            Insurance renewal email tool — Fleur De Lis Law &amp; Title
          </p>
        </div>

        {/* Step indicator */}
        <ol className="mb-8 flex items-center justify-center gap-4 text-sm">
          {(["upload", "preview", "sent"] as Step[]).map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-gray-300">›</span>}
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full font-semibold ${
                  step === s
                    ? "bg-green-700 text-white"
                    : s === "sent" ||
                      (step === "preview" && s === "upload") ||
                      step === "sent"
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={
                  step === s ? "font-semibold text-green-800" : "text-gray-400"
                }
              >
                {s === "upload" ? "Upload & Select Month" : s === "preview" ? "Preview" : "Done"}
              </span>
            </li>
          ))}
        </ol>

        {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
            <h2 className="mb-6 text-xl font-semibold text-gray-800">
              1. Upload recipient file &amp; choose outreach month
            </h2>

            {/* File picker */}
            <label className="mb-6 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Recipient file (CSV or Excel)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xlsm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-700 file:mr-4 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-green-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-green-800"
              />
              {file && (
                <p className="mt-1.5 text-xs text-green-700">
                  Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </label>

            {/* Month picker */}
            <label className="mb-8 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Outreach month
              </span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              />
              <p className="mt-1 text-xs text-gray-500">
                Recipients whose closing anniversary falls in{" "}
                <strong>{friendlyMonth(month.replace("-", "-").padEnd(7, "-01").slice(0, 7))}</strong> + 2&nbsp;months will be matched.
              </p>
            </label>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handlePreview}
              disabled={!file || loading}
              className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Parsing…" : "Preview Emails →"}
            </button>
          </div>
        )}

        {/* ── STEP 2: Preview ────────────────────────────────────────────── */}
        {step === "preview" && parseResult && (
          <div className="space-y-6">
            {/* Summary banner */}
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <div className="flex-1">
                <p className="text-sm text-gray-500">Outreach month</p>
                <p className="font-semibold text-green-800">{friendlyMonth(month)}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-700">{parseResult.eligible.length}</p>
                <p className="text-xs text-gray-500">eligible</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-400">{parseResult.totalRows}</p>
                <p className="text-xs text-gray-500">total rows</p>
              </div>
              {parseResult.errors.length > 0 && (
                <div className="text-center">
                  <p className="text-3xl font-bold text-orange-500">{parseResult.errors.length}</p>
                  <p className="text-xs text-gray-500">row errors</p>
                </div>
              )}
            </div>

            {/* Parse errors */}
            {parseResult.errors.length > 0 && (
              <details className="rounded-2xl bg-orange-50 p-5 ring-1 ring-orange-200">
                <summary className="cursor-pointer font-medium text-orange-800">
                  {parseResult.errors.length} row error(s) — click to expand
                </summary>
                <ul className="mt-3 space-y-1 text-sm text-orange-700">
                  {parseResult.errors.map((e, i) => (
                    <li key={i} className="list-inside list-disc">
                      {e}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Already sent skips */}
            {parseResult.skippedAlreadySent.length > 0 && (
              <details className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-200">
                <summary className="cursor-pointer font-medium text-blue-800">
                  {parseResult.skippedAlreadySent.length} already-sent skip(s)
                </summary>
                <ul className="mt-3 space-y-1 text-sm text-blue-700">
                  {parseResult.skippedAlreadySent.map((s, i) => (
                    <li key={i} className="list-inside list-disc">
                      {s}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Recipient table */}
            {parseResult.eligible.length > 0 ? (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-green-700 text-left text-xs font-semibold uppercase tracking-wide text-white">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Property Address</th>
                      <th className="px-4 py-3">Renewal Cycle</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parseResult.eligible.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {item.recipient.firstName || <em className="text-gray-400">Business</em>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{item.recipient.email}</td>
                        <td className="px-4 py-3 text-gray-600">{item.recipient.propertyAddress}</td>
                        <td className="px-4 py-3 text-gray-600">{item.renewalCycle}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              item.recipient.propertyType === "commercial" ||
                              item.recipient.propertyType === "investment"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {item.recipient.propertyType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setPreviewItem(item)}
                            className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                          >
                            Preview
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm ring-1 ring-gray-200">
                No recipients matched outreach month {friendlyMonth(month)}.
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={reset}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                ← Start Over
              </button>

              {parseResult.eligible.length > 0 && (
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={loading}
                  className="rounded-xl bg-green-700 px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-50"
                >
                  {loading ? "Sending…" : `Send ${parseResult.eligible.length} Email(s) →`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Sent ───────────────────────────────────────────────── */}
        {step === "sent" && sendResult && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-200">
              <div className="mb-4 text-5xl">✅</div>
              <h2 className="text-2xl font-bold text-green-800">Done!</h2>
              <p className="mt-2 text-gray-600">
                <strong className="text-green-700">{sendResult.sent}</strong> email(s) sent
                successfully.
                {sendResult.failed.length > 0 && (
                  <span className="text-red-600">
                    {" "}
                    {sendResult.failed.length} failed.
                  </span>
                )}
              </p>
            </div>

            {sendResult.failed.length > 0 && (
              <div className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-200">
                <h3 className="mb-3 font-semibold text-red-800">Failed sends</h3>
                <ul className="space-y-2 text-sm text-red-700">
                  {sendResult.failed.map((f, i) => (
                    <li key={i}>
                      <strong>{f.email}</strong> — {f.address}
                      <br />
                      <span className="text-xs">{f.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={reset}
              className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white shadow-sm hover:bg-green-800"
            >
              Send Another Batch
            </button>
          </div>
        )}
      </div>

      {/* Email preview modal */}
      {previewItem && (
        <EmailPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      {/* Send confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900">Confirm Send</h3>
            <p className="mb-4 text-sm text-gray-600">
              This will send{" "}
              <strong className="text-green-700">
                {parseResult?.eligible.length} real email(s)
              </strong>{" "}
              to recipients. Type <strong>SEND</strong> below to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type SEND"
              className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={confirmText !== "SEND" || loading}
                className="flex-1 rounded-xl bg-green-700 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-40"
              >
                Confirm &amp; Send
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
