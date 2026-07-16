"use client";

import { useState, useRef } from "react";
import type { EligibleRecipient, ParseResult, SendResult } from "@/types";

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
// Email preview panel (right pane)
// ---------------------------------------------------------------------------
function EmailPreviewPanel({ item }: { item: EligibleRecipient }) {
  const [showHtml, setShowHtml] = useState(false);

  return (
    <div className="flex h-full flex-col bg-app-surface">
      {/* Header */}
      <div className="border-b border-l-4 border-b-brand-200 border-l-brand-600 bg-brand-50 px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
          Email Preview
        </p>
        <p className="mt-1 text-base font-semibold text-brand-900">
          {item.recipient.email}
        </p>
        <p className="mt-1 text-sm text-brand-700">
          Subject: {item.emailContent.subject}
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-app-border bg-app-surface px-6 py-3">
        <div
          className="inline-flex rounded-lg bg-app-surface-subtle p-1"
          role="tablist"
          aria-label="Email format"
        >
          <button
            role="tab"
            aria-selected={!showHtml}
            onClick={() => setShowHtml(false)}
            className={
              !showHtml
                ? "rounded-md bg-app-surface px-4 py-1.5 text-sm font-semibold text-brand-800 shadow-sm ring-1 ring-app-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
                : "rounded-md px-4 py-1.5 text-sm font-medium text-app-text-muted transition-colors hover:bg-white/70 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            }
          >
            Plain Text
          </button>
          <button
            role="tab"
            aria-selected={showHtml}
            onClick={() => setShowHtml(true)}
            className={
              showHtml
                ? "rounded-md bg-app-surface px-4 py-1.5 text-sm font-semibold text-brand-800 shadow-sm ring-1 ring-app-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
                : "rounded-md px-4 py-1.5 text-sm font-medium text-app-text-muted transition-colors hover:bg-white/70 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            }
          >
            HTML
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto bg-app-surface px-6 py-6 outreach-scrollbar">
        {showHtml ? (
          <div className="rounded-lg border border-app-border bg-white p-6 shadow-sm">
            <div
              className="max-w-5xl text-[15px] leading-7 text-app-text"
              dangerouslySetInnerHTML={{ __html: item.emailContent.htmlBody }}
            />
          </div>
        ) : (
          <pre className="max-w-5xl whitespace-pre-wrap font-mono text-[14px] leading-7 text-app-text">
            {item.emailContent.textBody}
          </pre>
        )}
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
  const [selectedItem, setSelectedItem] = useState<EligibleRecipient | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (!res.ok || data.error) { setError(data.error ?? "Unexpected error."); return; }
      setParseResult(data);
      setSelectedItem(data.eligible[0] ?? null);
      setStep("preview");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

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
      if (!res.ok || data.error) { setError(data.error ?? "Unexpected error."); return; }
      setSendResult(data);
      setStep("sent");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setParseResult(null);
    setSendResult(null);
    setError(null);
    setSelectedItem(null);
    setConfirmText("");
    setShowConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Step state helpers
  const isCompleted = (s: Step) =>
    (s === "upload" && (step === "preview" || step === "sent")) ||
    (s === "preview" && step === "sent");
  const isActive = (s: Step) => step === s;

  return (
    <main className="flex min-h-screen flex-col bg-app-background text-app-text">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="border-b border-app-border bg-app-surface px-6 py-4">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-brand-800">
              Fleur De Lis Renewal Outreach
            </h1>
            <p className="mt-0.5 text-sm text-app-text-muted">Insurance renewal email tool</p>
          </div>

          {/* Step indicator */}
          <ol className="flex items-center gap-2">
            {(["upload", "preview", "sent"] as Step[]).map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-5 bg-app-border" aria-hidden />}
                <span
                  className={
                    isActive(s)
                      ? "flex size-7 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white ring-4 ring-brand-100"
                      : isCompleted(s)
                      ? "flex size-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
                      : "flex size-7 items-center justify-center rounded-full bg-app-surface-subtle text-xs font-semibold text-app-text-muted"
                  }
                >
                  {i + 1}
                </span>
                <span
                  className={
                    isActive(s)
                      ? "text-sm font-semibold text-brand-800"
                      : isCompleted(s)
                      ? "text-sm font-medium text-app-text-secondary"
                      : "text-sm font-medium text-app-text-muted"
                  }
                >
                  {s === "upload" ? "Upload" : s === "preview" ? "Review & Send" : "Done"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      {/* ── STEP 1: Upload ───────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="mx-auto mt-16 w-full max-w-lg px-4">
          <div className="rounded-xl border border-app-border bg-app-surface p-8 shadow-sm">
            <h2 className="mb-6 text-base font-semibold text-app-text">
              Upload recipient file &amp; choose outreach month
            </h2>

            <label className="mb-5 block">
              <span className="mb-1 block text-sm font-medium text-app-text-secondary">
                Recipient file (CSV or Excel)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xlsm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-lg border border-app-border bg-app-surface-subtle text-sm text-app-text file:mr-4 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-800"
              />
              {file && (
                <p className="mt-1.5 text-xs text-brand-700">
                  {file.name} — {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
            </label>

            <label className="mb-7 block">
              <span className="mb-1 block text-sm font-medium text-app-text-secondary">
                Outreach month
              </span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-app-text-muted">
                Matches closings whose anniversary is{" "}
                <strong className="text-app-text-secondary">{friendlyMonth(month)}</strong> + 2 months.
              </p>
            </label>

            {error && (
              <div className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
                {error}
              </div>
            )}

            <button
              onClick={handlePreview}
              disabled={!file || loading}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:bg-brand-900 disabled:pointer-events-none disabled:bg-brand-300"
            >
              {loading ? "Parsing…" : "Preview Emails →"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Split-pane preview ───────────────────────────────────── */}
      {step === "preview" && parseResult && (
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="border-b border-app-border bg-app-surface px-6 py-4">
            <div className="mx-auto flex max-w-screen-xl flex-wrap items-center gap-6 min-w-0">
              {/* Metrics */}
              <div className="flex min-w-0 flex-wrap items-center gap-6">
                <span className="whitespace-nowrap">
                  <span className="font-semibold tabular-nums text-brand-700">
                    {parseResult.eligible.length}
                  </span>{" "}
                  <span className="text-sm text-app-text-secondary">eligible</span>
                </span>
                <span className="whitespace-nowrap">
                  <span className="font-semibold tabular-nums text-app-text">
                    {parseResult.totalRows}
                  </span>{" "}
                  <span className="text-sm text-app-text-secondary">total rows</span>
                </span>
                {parseResult.errors.length > 0 && (
                  <span className="whitespace-nowrap">
                    <span className="font-semibold tabular-nums text-danger-600">
                      {parseResult.errors.length}
                    </span>{" "}
                    <span className="text-sm text-danger-700">errors</span>
                  </span>
                )}
                <span className="text-sm font-medium text-app-text-muted">
                  {friendlyMonth(month)}
                </span>
              </div>

              {/* Actions */}
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <button
                  onClick={reset}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-app-border bg-app-surface px-4 text-sm font-medium text-app-text-secondary shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  ← Back
                </button>
                {parseResult.eligible.length > 0 && (
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={loading}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:bg-brand-900 disabled:pointer-events-none disabled:bg-brand-300"
                  >
                    {loading ? "Sending…" : `Send ${parseResult.eligible.length} Email(s) →`}
                  </button>
                )}
              </div>
            </div>

            {/* API error */}
            {error && (
              <div className="mx-auto mt-3 max-w-screen-xl rounded-lg border border-danger-200 bg-danger-50 px-4 py-2 text-sm text-danger-700">
                {error}
              </div>
            )}

            {/* Row errors / skips */}
            {(parseResult.errors.length > 0 || parseResult.skippedAlreadySent.length > 0) && (
              <div className="mx-auto mt-3 max-w-screen-xl flex flex-wrap gap-3">
                {parseResult.errors.length > 0 && (
                  <details className="flex-1 min-w-[200px]">
                    <summary className="flex cursor-pointer items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-2.5 text-sm font-medium text-warning-700 select-none">
                      <svg className="size-4 shrink-0 text-warning-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      {parseResult.errors.length} row error(s) require attention
                    </summary>
                    <ul className="mt-1 space-y-0.5 px-4 py-2 text-xs text-warning-700">
                      {parseResult.errors.map((e, i) => (
                        <li key={i} className="list-inside list-disc">{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {parseResult.skippedAlreadySent.length > 0 && (
                  <details className="flex-1 min-w-[200px]">
                    <summary className="flex cursor-pointer items-center gap-2 rounded-lg border border-info-600/20 bg-info-50 px-4 py-2.5 text-sm font-medium text-info-600 select-none">
                      {parseResult.skippedAlreadySent.length} already-sent skip(s)
                    </summary>
                    <ul className="mt-1 space-y-0.5 px-4 py-2 text-xs text-info-600">
                      {parseResult.skippedAlreadySent.map((s, i) => (
                        <li key={i} className="list-inside list-disc">{s}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Split pane */}
          <div className="flex min-h-0 flex-1 bg-app-background">
            {/* Left: recipient list */}
            <aside className="w-[30%] min-w-[280px] max-w-[500px] border-r border-app-border bg-app-surface outreach-scrollbar overflow-y-auto">
              <p className="border-b border-app-border-subtle px-4 py-3 text-xs font-medium text-app-text-muted">
                {parseResult.eligible.length} recipient(s) — click to preview
              </p>
              <ul role="listbox" aria-label="Recipients">
                {parseResult.eligible.map((item, i) => {
                  const active = selectedItem === item;
                  const isCommercial =
                    item.recipient.propertyType === "commercial" ||
                    item.recipient.propertyType === "investment";
                  return (
                    <li key={i} role="option" aria-selected={active}>
                      <button
                        onClick={() => setSelectedItem(item)}
                        className={
                          active
                            ? "relative w-full border-b border-app-border-subtle border-l-4 border-l-brand-600 bg-brand-100 px-4 py-4 text-left transition-colors hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                            : "relative w-full border-b border-app-border-subtle px-5 py-4 text-left transition-colors hover:bg-app-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                        }
                      >
                        <p className={`truncate text-sm font-semibold ${active ? "text-brand-800" : "text-app-text"}`}>
                          {item.recipient.firstName || (
                            <em className="font-normal text-app-text-muted">Business</em>
                          )}
                          <span className="ml-1 text-xs font-normal text-app-text-muted">
                            #{i + 1}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-xs font-medium leading-5 text-app-text-secondary">
                          {item.recipient.email}
                        </p>
                        <p className="truncate text-xs text-app-text-muted">
                          {item.recipient.propertyAddress}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span
                            className={
                              isCommercial
                                ? "inline-flex items-center rounded-full bg-info-50 px-2 py-0.5 text-[11px] font-medium text-info-600 ring-1 ring-inset ring-info-600/20"
                                : "inline-flex items-center rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-medium text-success-700 ring-1 ring-inset ring-success-200"
                            }
                          >
                            {item.recipient.propertyType}
                          </span>
                          <span className="text-xs tabular-nums text-app-text-muted">
                            {item.renewalCycle}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Right: email preview */}
            <main className="min-w-0 w-[70%] overflow-hidden bg-app-surface">
              {selectedItem ? (
                <EmailPreviewPanel item={selectedItem} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-app-text-muted">
                  Select a recipient on the left to preview their email.
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      {/* ── STEP 3: Sent ─────────────────────────────────────────────────── */}
      {step === "sent" && sendResult && (
        <div className="mx-auto mt-16 w-full max-w-lg space-y-5 px-4">
          <div className="rounded-xl border border-app-border bg-app-surface p-10 text-center shadow-sm">
            <div className="mb-4 text-5xl">✅</div>
            <h2 className="text-xl font-semibold text-brand-800">Done!</h2>
            <p className="mt-2 text-sm text-app-text-secondary">
              <strong className="font-semibold tabular-nums text-brand-700">
                {sendResult.sent}
              </strong>{" "}
              email(s) sent successfully.
              {sendResult.failed.length > 0 && (
                <span className="text-danger-600"> {sendResult.failed.length} failed.</span>
              )}
            </p>
          </div>

          {sendResult.failed.length > 0 && (
            <div className="rounded-xl border border-danger-200 bg-danger-50 p-5">
              <h3 className="mb-3 text-sm font-semibold text-danger-700">Failed sends</h3>
              <ul className="space-y-2 text-sm text-danger-700">
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
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:bg-brand-900"
          >
            Send Another Batch
          </button>
        </div>
      )}

      {/* ── Send confirmation dialog ──────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-app-border bg-app-surface p-8 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-app-text">Confirm Send</h3>
            <p className="mb-4 text-sm text-app-text-secondary">
              This will send{" "}
              <strong className="font-semibold text-brand-700">
                {parseResult?.eligible.length} real email(s)
              </strong>{" "}
              to recipients. Type <strong>SEND</strong> to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type SEND"
              className="mb-4 w-full rounded-lg border border-app-border bg-app-surface px-4 py-2 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-app-border bg-app-surface text-sm font-medium text-app-text-secondary transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={confirmText !== "SEND" || loading}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:bg-brand-900 disabled:pointer-events-none disabled:bg-brand-300"
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
