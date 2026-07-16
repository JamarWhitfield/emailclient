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

function EmailPreviewPanel({ item }: { item: EligibleRecipient }) {
  const [showHtml, setShowHtml] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-green-700 px-5 py-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Email Preview</p>
        <p className="mt-0.5 truncate font-semibold">{item.recipient.email}</p>
        <p className="mt-0.5 truncate text-sm opacity-80">Subject: {item.emailContent.subject}</p>
      </div>
      <div className="flex gap-2 border-b px-5 py-3">
        <button
          onClick={() => setShowHtml(false)}
          className={`rounded px-3 py-1 text-xs font-medium transition ${!showHtml ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          Plain Text
        </button>
        <button
          onClick={() => setShowHtml(true)}
          className={`rounded px-3 py-1 text-xs font-medium transition ${showHtml ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          HTML
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {showHtml ? (
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: item.emailContent.htmlBody }} />
        ) : (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{item.emailContent.textBody}</pre>
        )}
      </div>
    </div>
  );
}

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

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      {/* Top bar */}
      <header className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-green-800">Fleur De Lis Renewal Outreach</h1>
            <p className="text-xs text-gray-400">Insurance renewal email tool</p>
          </div>
          <ol className="flex items-center gap-3 text-sm">
            {(["upload", "preview", "sent"] as Step[]).map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && <span className="text-gray-300">›</span>}
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step === s ? "bg-green-700 text-white" : (step === "preview" && s === "upload") || step === "sent" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-400"}`}>
                  {i + 1}
                </span>
                <span className={step === s ? "font-semibold text-green-800" : "text-gray-400"}>
                  {s === "upload" ? "Upload" : s === "preview" ? "Review & Send" : "Done"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      {/* STEP 1: Upload */}
      {step === "upload" && (
        <div className="mx-auto mt-16 w-full max-w-lg px-4">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
            <h2 className="mb-6 text-lg font-semibold text-gray-800">Upload recipient file &amp; choose outreach month</h2>
            <label className="mb-5 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Recipient file (CSV or Excel)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xlsm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-700 file:mr-4 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-green-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-green-800"
              />
              {file && <p className="mt-1.5 text-xs text-green-700">{file.name} — {(file.size / 1024).toFixed(1)} KB</p>}
            </label>
            <label className="mb-7 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Outreach month</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              />
              <p className="mt-1 text-xs text-gray-400">
                Matches closings whose anniversary is <strong className="text-gray-600">{friendlyMonth(month)}</strong> + 2 months.
              </p>
            </label>
            {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <button
              onClick={handlePreview}
              disabled={!file || loading}
              className="w-full rounded-xl bg-green-700 py-3 font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Parsing…" : "Preview Emails →"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Split-pane */}
      {step === "preview" && parseResult && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Sub-header */}
          <div className="border-b bg-white px-6 py-3">
            <div className="mx-auto flex max-w-screen-xl flex-wrap items-center gap-4">
              <div className="flex items-center gap-5 text-sm">
                <span><strong className="text-green-700">{parseResult.eligible.length}</strong> <span className="text-gray-500">eligible</span></span>
                <span><strong className="text-gray-500">{parseResult.totalRows}</strong> <span className="text-gray-400">total rows</span></span>
                {parseResult.errors.length > 0 && <span><strong className="text-orange-500">{parseResult.errors.length}</strong> <span className="text-gray-400">errors</span></span>}
                <span className="text-gray-400">{friendlyMonth(month)}</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <button onClick={reset} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">← Back</button>
                {parseResult.eligible.length > 0 && (
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={loading}
                    className="rounded-lg bg-green-700 px-5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-50"
                  >
                    {loading ? "Sending…" : `Send ${parseResult.eligible.length} Email(s) →`}
                  </button>
                )}
              </div>
            </div>
            {error && <div className="mx-auto mt-2 max-w-screen-xl rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
            {(parseResult.errors.length > 0 || parseResult.skippedAlreadySent.length > 0) && (
              <div className="mx-auto mt-2 max-w-screen-xl flex flex-wrap gap-4 text-sm">
                {parseResult.errors.length > 0 && (
                  <details><summary className="cursor-pointer font-medium text-orange-700">{parseResult.errors.length} row error(s)</summary>
                    <ul className="mt-1 text-orange-600">{parseResult.errors.map((e, i) => <li key={i} className="list-inside list-disc">{e}</li>)}</ul>
                  </details>
                )}
                {parseResult.skippedAlreadySent.length > 0 && (
                  <details><summary className="cursor-pointer font-medium text-blue-700">{parseResult.skippedAlreadySent.length} already-sent skip(s)</summary>
                    <ul className="mt-1 text-blue-600">{parseResult.skippedAlreadySent.map((s, i) => <li key={i} className="list-inside list-disc">{s}</li>)}</ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Split pane */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: recipient list */}
            <div className="w-80 flex-shrink-0 overflow-y-auto border-r bg-white">
              <p className="px-4 py-2 text-xs text-gray-400">{parseResult.eligible.length} recipient(s) — click to preview</p>
              <ul>
                {parseResult.eligible.map((item, i) => {
                  const active = selectedItem === item;
                  return (
                    <li key={i}>
                      <button
                        onClick={() => setSelectedItem(item)}
                        className={`w-full border-l-4 px-4 py-3 text-left transition ${active ? "border-green-600 bg-green-50" : "border-transparent hover:bg-gray-50"}`}
                      >
                        <p className={`truncate font-medium ${active ? "text-green-800" : "text-gray-800"}`}>
                          {item.recipient.firstName || <em className="font-normal text-gray-400">Business</em>}
                          {" "}<span className="text-xs font-normal text-gray-400">#{i + 1}</span>
                        </p>
                        <p className="truncate text-xs text-gray-500">{item.recipient.email}</p>
                        <p className="truncate text-xs text-gray-400">{item.recipient.propertyAddress}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${item.recipient.propertyType === "commercial" || item.recipient.propertyType === "investment" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                            {item.recipient.propertyType}
                          </span>
                          <span className="text-xs text-gray-400">{item.renewalCycle}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Right: preview */}
            <div className="flex-1 overflow-hidden bg-gray-50">
              {selectedItem ? (
                <EmailPreviewPanel item={selectedItem} />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">Select a recipient on the left to preview their email.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Sent */}
      {step === "sent" && sendResult && (
        <div className="mx-auto mt-16 w-full max-w-lg space-y-6 px-4">
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-200">
            <div className="mb-4 text-5xl">✅</div>
            <h2 className="text-2xl font-bold text-green-800">Done!</h2>
            <p className="mt-2 text-gray-600">
              <strong className="text-green-700">{sendResult.sent}</strong> email(s) sent successfully.
              {sendResult.failed.length > 0 && <span className="text-red-600"> {sendResult.failed.length} failed.</span>}
            </p>
          </div>
          {sendResult.failed.length > 0 && (
            <div className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-200">
              <h3 className="mb-3 font-semibold text-red-800">Failed sends</h3>
              <ul className="space-y-2 text-sm text-red-700">
                {sendResult.failed.map((f, i) => (
                  <li key={i}><strong>{f.email}</strong> — {f.address}<br /><span className="text-xs">{f.error}</span></li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={reset} className="w-full rounded-xl bg-green-700 py-3 font-semibold text-white shadow-sm hover:bg-green-800">
            Send Another Batch
          </button>
        </div>
      )}

      {/* Send confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900">Confirm Send</h3>
            <p className="mb-4 text-sm text-gray-600">
              This will send <strong className="text-green-700">{parseResult?.eligible.length} real email(s)</strong> to recipients. Type <strong>SEND</strong> to confirm.
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
              <button onClick={() => { setShowConfirm(false); setConfirmText(""); }} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSend} disabled={confirmText !== "SEND" || loading} className="flex-1 rounded-xl bg-green-700 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-40">
                Confirm &amp; Send
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
