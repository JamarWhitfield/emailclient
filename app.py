"""Local desktop app for Fleur De Lis Law & Title renewal outreach.

This is a simple point-and-click window for non-technical staff. It reuses the
same logic as main.py, so previews and sends behave exactly like the command
line tool. Staff can run it by double-clicking run_app.command (macOS) or by
running: python3 app.py

Workflow inside the app:
  1. Choose the recipient CSV file (or keep the default).
  2. Pick the outreach month (defaults to the current month).
  3. Click "Preview" to see who matches and read each email.
  4. Review any problems the app flags in the recipient file.
  5. Click "Send Emails", then type SEND to confirm.

Nothing is ever sent until you explicitly preview, then confirm with SEND.
"""

from __future__ import annotations

import os
import sys
import threading
import tkinter as tk
from datetime import date
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import main as outreach


APP_TITLE = "Fleur De Lis Renewal Outreach"


def working_directory() -> Path:
    """Folder where the app reads/writes its files (.env, sent_log.csv, etc.).

    When packaged as a macOS .app, the program starts in "/", so we instead use
    the folder that contains the .app bundle. When run as a plain script we use
    the folder the script lives in.
    """
    if getattr(sys, "frozen", False):
        executable = Path(sys.executable).resolve()
        for parent in executable.parents:
            if parent.suffix == ".app":
                return parent.parent
        return executable.parent
    return Path(__file__).resolve().parent


class OutreachApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("960x640")
        self.root.minsize(820, 560)

        # Load .env once so send mode can find provider settings later.
        outreach.load_environment()

        self.csv_path = outreach.DEFAULT_RECIPIENTS_FILE
        self.sent_log_path = outreach.DEFAULT_SENT_LOG_FILE

        # The most recent preview result. Send is only allowed after a preview.
        self.eligible: list[outreach.EligibleRecipient] = []
        self.recipient_errors: list[str] = []
        self.previewed_month: date | None = None

        self._build_widgets()
        self._refresh_send_button()

    # ----- UI construction -------------------------------------------------

    def _build_widgets(self) -> None:
        # File bar: lets staff pick/upload a different recipient CSV.
        file_bar = ttk.Frame(self.root, padding=(12, 12, 12, 0))
        file_bar.pack(fill=tk.X)

        ttk.Label(file_bar, text="Recipient file:").pack(side=tk.LEFT)
        self.csv_var = tk.StringVar(value=self._csv_display())
        self.csv_label = ttk.Label(file_bar, textvariable=self.csv_var, foreground="#0a5a2a")
        self.csv_label.pack(side=tk.LEFT, padx=(6, 12))
        self.choose_button = ttk.Button(
            file_bar, text="Choose file (CSV or Excel)\u2026", command=self.on_choose_csv
        )
        self.choose_button.pack(side=tk.LEFT)

        top = ttk.Frame(self.root, padding=12)
        top.pack(fill=tk.X)

        ttk.Label(top, text="Outreach month (YYYY-MM):").pack(side=tk.LEFT)

        today = date.today()
        self.month_var = tk.StringVar(value=f"{today.year}-{today.month:02d}")
        month_entry = ttk.Entry(top, textvariable=self.month_var, width=12)
        month_entry.pack(side=tk.LEFT, padx=(6, 16))

        self.preview_button = ttk.Button(top, text="Preview", command=self.on_preview)
        self.preview_button.pack(side=tk.LEFT)

        self.send_button = ttk.Button(top, text="Send Emails", command=self.on_send)
        self.send_button.pack(side=tk.LEFT, padx=(8, 0))

        # Demo mode: simulate sending without delivering any real email.
        self.demo_var = tk.BooleanVar(value=False)
        self.demo_check = ttk.Checkbutton(
            top,
            text="Demo mode (no real emails)",
            variable=self.demo_var,
        )
        self.demo_check.pack(side=tk.LEFT, padx=(12, 0))

        ttk.Label(
            top,
            text="Tip: Preview is always safe and never sends anything.",
            foreground="#555555",
        ).pack(side=tk.RIGHT)

        body = ttk.Panedwindow(self.root, orient=tk.HORIZONTAL)
        body.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 8))

        # Left: list of matched recipients.
        left = ttk.Frame(body)
        body.add(left, weight=1)

        ttk.Label(left, text="Matched recipients").pack(anchor=tk.W)

        columns = ("name", "email", "cycle")
        self.tree = ttk.Treeview(left, columns=columns, show="headings", height=18)
        self.tree.heading("name", text="Name")
        self.tree.heading("email", text="Email")
        self.tree.heading("cycle", text="Renewal cycle")
        self.tree.column("name", width=120)
        self.tree.column("email", width=200)
        self.tree.column("cycle", width=110)
        self.tree.pack(fill=tk.BOTH, expand=True, pady=(4, 0))
        self.tree.bind("<<TreeviewSelect>>", self.on_select_recipient)

        # Right: email preview for the selected recipient.
        right = ttk.Frame(body)
        body.add(right, weight=2)

        ttk.Label(right, text="Email preview").pack(anchor=tk.W)
        self.preview_text = tk.Text(right, wrap=tk.WORD, height=18)
        self.preview_text.configure(state=tk.DISABLED)
        self.preview_text.pack(fill=tk.BOTH, expand=True, pady=(4, 0))

        # Bottom: problems and status.
        bottom = ttk.Frame(self.root, padding=(12, 0, 12, 12))
        bottom.pack(fill=tk.BOTH)

        ttk.Label(bottom, text="Problems found in recipients file").pack(anchor=tk.W)
        self.errors_text = tk.Text(bottom, wrap=tk.WORD, height=5, foreground="#a40000")
        self.errors_text.configure(state=tk.DISABLED)
        self.errors_text.pack(fill=tk.X, pady=(4, 6))

        self.status_var = tk.StringVar(value="Ready. Click Preview to begin.")
        status = ttk.Label(self.root, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W, padding=6)
        status.pack(fill=tk.X, side=tk.BOTTOM)

    # ----- Actions ---------------------------------------------------------

    def _csv_display(self) -> str:
        name = self.csv_path.name
        if not self.csv_path.exists():
            return f"{name}  (not found)"
        return name

    def on_choose_csv(self) -> None:
        start_dir = self.csv_path.parent if self.csv_path.parent.exists() else Path.cwd()
        chosen = filedialog.askopenfilename(
            title="Choose a recipients file",
            initialdir=str(start_dir),
            filetypes=[
                ("Spreadsheets", "*.csv *.xlsx *.xlsm"),
                ("CSV files", "*.csv"),
                ("Excel files", "*.xlsx *.xlsm"),
                ("All files", "*.*"),
            ],
        )
        if not chosen:
            return

        self.csv_path = Path(chosen)
        self.csv_var.set(self._csv_display())

        # New data means the old preview no longer applies. Reset, then preview
        # the new file right away so the worker immediately sees the results.
        self.eligible = []
        self.recipient_errors = []
        self.previewed_month = None
        self._clear_tree()
        self._set_text(self.preview_text, "")
        self._show_errors([])
        self._refresh_send_button()
        self.status_var.set(f"Loaded file: {self.csv_path.name}. Previewing\u2026")
        self.on_preview()

    def on_preview(self) -> None:
        self.eligible = []
        self.recipient_errors = []
        self.previewed_month = None
        self._clear_tree()
        self._set_text(self.preview_text, "")
        self._refresh_send_button()

        raw_month = self.month_var.get().strip()
        try:
            target_month = outreach.parse_target_month(raw_month or None)
        except ValueError as exc:
            messagebox.showerror(APP_TITLE, str(exc))
            self.status_var.set("Invalid month. Use the YYYY-MM format, for example 2026-07.")
            return

        recipients, recipient_errors = outreach.load_recipients(self.csv_path)
        sent_keys, _ = outreach.load_sent_log(self.sent_log_path)
        eligible, _ = outreach.build_eligible_recipients(recipients, target_month, sent_keys)

        self.eligible = eligible
        self.recipient_errors = recipient_errors
        self.previewed_month = target_month

        for index, item in enumerate(eligible):
            self.tree.insert(
                "",
                tk.END,
                iid=str(index),
                values=(item.recipient.first_name, item.recipient.email, item.renewal_cycle),
            )

        self._show_errors(recipient_errors)

        if eligible:
            self.tree.selection_set("0")
            self.tree.focus("0")
            self._show_preview_for_index(0)

        self.status_var.set(
            f"Previewed {target_month.strftime('%Y-%m')}: "
            f"{len(eligible)} recipient(s) matched, {len(recipient_errors)} problem(s) found. Nothing was sent."
        )
        self._refresh_send_button()

    def on_select_recipient(self, _event: object = None) -> None:
        selection = self.tree.selection()
        if not selection:
            return
        self._show_preview_for_index(int(selection[0]))

    def on_send(self) -> None:
        if not self.eligible or self.previewed_month is None:
            messagebox.showinfo(APP_TITLE, "Please preview a month before sending.")
            return

        if self.recipient_errors:
            proceed = messagebox.askyesno(
                APP_TITLE,
                f"{len(self.recipient_errors)} row(s) in the file could not be used "
                "(for example, a missing or invalid email) and will be skipped.\n\n"
                f"Do you want to continue and email the {len(self.eligible)} valid "
                "recipient(s)?",
            )
            if not proceed:
                self.status_var.set("Send cancelled. Nothing was sent.")
                return

        count = len(self.eligible)
        demo = self.demo_var.get()
        confirm = ConfirmSendDialog(self.root, count, self.previewed_month.strftime("%Y-%m"), demo=demo)
        self.root.wait_window(confirm.top)
        if not confirm.confirmed:
            self.status_var.set("Send cancelled. Nothing was sent.")
            return

        if demo:
            provider: outreach.EmailProvider = outreach.DemoProvider()
        else:
            try:
                provider = outreach.create_provider()
            except outreach.ConfigurationError as exc:
                messagebox.showerror(APP_TITLE, str(exc))
                self.status_var.set("Send blocked: email account is not configured yet.")
                return

        self._set_buttons_enabled(False)
        action = "Simulating" if demo else "Sending"
        self.status_var.set(f"{action} {count} email(s)... please wait.")

        # Send on a worker thread so the window stays responsive.
        thread = threading.Thread(
            target=self._send_worker,
            args=(provider, list(self.eligible), demo),
            daemon=True,
        )
        thread.start()

    def _send_worker(
        self,
        provider: outreach.EmailProvider,
        eligible: list[outreach.EligibleRecipient],
        demo: bool,
    ) -> None:
        try:
            success_status = "demo" if demo else "sent"
            sent, failed = outreach.send_emails(
                provider, eligible, self.sent_log_path, success_status=success_status
            )
            self.root.after(0, lambda: self._send_done(sent, failed, demo))
        except Exception as exc:  # noqa: BLE001
            self.root.after(0, lambda: self._send_failed(str(exc)))

    def _send_done(self, sent: int, failed: int, demo: bool) -> None:
        self._set_buttons_enabled(True)
        label = "Demo finished (no real emails sent)." if demo else "Finished."
        verb = "Simulated" if demo else "Sent"
        messagebox.showinfo(APP_TITLE, f"{label}\n\n{verb}: {sent}\nFailed: {failed}")
        self.status_var.set(
            f"{verb} {sent}, failed {failed}. Re-run Preview to refresh the list."
        )
        # Refresh so already-sent recipients drop out of the list.
        self.on_preview()

    def _send_failed(self, message: str) -> None:
        self._set_buttons_enabled(True)
        messagebox.showerror(APP_TITLE, f"Sending stopped:\n\n{message}")
        self.status_var.set("Send failed. See the message for details.")

    # ----- Helpers ---------------------------------------------------------

    def _show_preview_for_index(self, index: int) -> None:
        if index < 0 or index >= len(self.eligible):
            return
        item = self.eligible[index]
        content = item.email_content
        preview = (
            f"To: {item.recipient.email}\n"
            f"Subject: {content.subject}\n"
            f"Renewal cycle: {item.renewal_cycle}\n"
            f"{'-' * 60}\n\n"
            f"{content.text_body}\n"
        )
        self._set_text(self.preview_text, preview)

    def _show_errors(self, errors: list[str]) -> None:
        if errors:
            self._set_text(self.errors_text, "\n".join(errors))
        else:
            self._set_text(self.errors_text, "No problems found.")

    def _clear_tree(self) -> None:
        for child in self.tree.get_children():
            self.tree.delete(child)

    def _set_text(self, widget: tk.Text, value: str) -> None:
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, value)
        widget.configure(state=tk.DISABLED)

    def _set_buttons_enabled(self, enabled: bool) -> None:
        state = tk.NORMAL if enabled else tk.DISABLED
        self.preview_button.configure(state=state)
        self.send_button.configure(state=state)
        if enabled:
            self._refresh_send_button()

    def _refresh_send_button(self) -> None:
        # Skipped/problem rows are simply not emailed, so they should not block
        # sending to the valid recipients. Enable Send whenever we have matches.
        can_send = bool(self.eligible)
        self.send_button.configure(state=tk.NORMAL if can_send else tk.DISABLED)


class ConfirmSendDialog:
    """Second confirmation that requires typing SEND before any delivery."""

    def __init__(self, parent: tk.Misc, count: int, month_label: str, demo: bool = False) -> None:
        self.confirmed = False

        self.top = tk.Toplevel(parent)
        self.top.title("Confirm send")
        self.top.transient(parent)
        self.top.grab_set()
        self.top.resizable(False, False)

        frame = ttk.Frame(self.top, padding=16)
        frame.pack(fill=tk.BOTH, expand=True)

        if demo:
            headline = (
                f"DEMO MODE: this will simulate {count} email(s) for {month_label}.\n"
                f"No real emails will be sent."
            )
        else:
            headline = (
                f"You are about to send {count} email(s) for {month_label}\n"
                f"from Kellie Bridges."
            )

        ttk.Label(frame, text=headline, justify=tk.LEFT).pack(anchor=tk.W)

        ttk.Label(frame, text="Type SEND to confirm:").pack(anchor=tk.W, pady=(12, 4))

        self.entry_var = tk.StringVar()
        entry = ttk.Entry(frame, textvariable=self.entry_var, width=20)
        entry.pack(anchor=tk.W)
        entry.focus_set()

        buttons = ttk.Frame(frame)
        buttons.pack(anchor=tk.E, pady=(16, 0))

        ttk.Button(buttons, text="Cancel", command=self._cancel).pack(side=tk.RIGHT, padx=(8, 0))
        ttk.Button(buttons, text="Send", command=self._confirm).pack(side=tk.RIGHT)

        self.top.bind("<Return>", lambda _event: self._confirm())
        self.top.bind("<Escape>", lambda _event: self._cancel())

    def _confirm(self) -> None:
        if self.entry_var.get().strip().upper() == "SEND":
            self.confirmed = True
            self.top.destroy()
        else:
            messagebox.showwarning("Confirm send", "Please type SEND exactly to confirm.")

    def _cancel(self) -> None:
        self.confirmed = False
        self.top.destroy()


def main() -> int:
    # Resolve data files next to the app/script, even when launched from Finder.
    os.chdir(working_directory())
    root = tk.Tk()
    OutreachApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
