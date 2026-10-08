import { useMemo, useState, type ReactNode } from "react";
import { RECIPIENT, checkDoc, makeRef, toRecord, type DocState } from "../lib/doc";
import { downloadBlob } from "../lib/download";
import { SHEET_FILENAME, buildSheet, loadLedger, saveToLedger } from "../lib/ledger";
import { buildPdf, type BuiltPdf } from "../lib/pdf";
import { submitSubmission, type SubmitResult } from "../lib/submit";
import { cn } from "../utils/cn";

interface Props {
  state: DocState;
  onClose: () => void;
  onNewDeclaration: () => void;
}

type Phase = "review" | "sending" | "done" | "error";

function Shell({ children, onClose, busy }: { children: ReactNode; onClose: () => void; busy?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:rounded-xl">{children}</div>
    </div>
  );
}

const Tick = ({ ok, required }: { ok: boolean; required: boolean }) =>
  ok ? (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-white">
      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  ) : (
    <span className={cn("h-4 w-4 rounded-full border", required ? "border-red-400" : "border-neutral-300")} />
  );

const btnGhost = "rounded-md px-3.5 py-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100";
const btnDark =
  "rounded-md bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-30";
const btnLine = "rounded-md border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 transition hover:border-neutral-900";

export default function SubmitModal({ state, onClose, onNewDeclaration }: Props) {
  const [phase, setPhase] = useState<Phase>("review");
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pdf, setPdf] = useState<BuiltPdf | null>(null);

  const ref = useMemo(() => state.fields.refNo.trim() || makeRef(), [state.fields.refNo]);
  const issues = checkDoc(state);
  const blocked = issues.some((i) => i.required && !i.ok);
  const pendingOptional = issues.filter((i) => !i.required && !i.ok);

  const submit = async () => {
    setPhase("sending");
    setError("");
    try {
      setStep("Preparing signed PDF");
      const built = await buildPdf(state, ref);
      setPdf(built);
      const record = toRecord(state, ref);
      setStep("Emailing PDF and submission sheet");
      const r = await submitSubmission(record, built);
      saveToLedger(record);
      setResult(r);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while submitting.");
      setPhase("error");
    }
  };

  const downloadPdf = () => pdf && downloadBlob(pdf.blob, pdf.filename);
  const downloadSheet = () => {
    const rec = toRecord(state, ref);
    const all = [...loadLedger().filter((x) => x.ref !== ref), rec];
    downloadBlob(buildSheet(all), SHEET_FILENAME);
  };

  if (phase === "sending") {
    return (
      <Shell onClose={onClose} busy>
        <div className="flex flex-col items-center px-8 py-14 text-center">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
          <p className="mt-5 text-sm font-semibold text-neutral-900">{step}…</p>
          <p className="mt-1 text-xs text-neutral-400">Please keep this window open.</p>
        </div>
      </Shell>
    );
  }

  if (phase === "done" && result) {
    return (
      <Shell onClose={onClose}>
        <div className="px-8 pb-6 pt-9 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>
          <h2 className="mt-4 text-lg font-semibold text-neutral-900">Submission sent</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
            The signed PDF and {result.ledgerMode === "submission" ? "submission details sheet" : "running submissions sheet"} were emailed to
            <br />
            <span className="font-medium text-neutral-900">{result.sentTo}</span>
          </p>
          <dl className="mt-6 divide-y divide-neutral-100 border-y border-neutral-100 text-left text-xs">
            <div className="flex justify-between py-2.5">
              <dt className="text-neutral-400">Reference</dt>
              <dd className="font-medium text-neutral-900">{result.ref}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-neutral-400">{result.ledgerMode === "submission" ? "Submission details" : "Row in running sheet"}</dt>
              <dd className="font-medium text-neutral-900">
                {result.ledgerMode === "submission" ? "Included in email" : `#${result.rowNumber} of ${result.totalSubmissions}`}
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button onClick={downloadPdf} className={btnLine}>
              Download my copy (PDF)
            </button>
            <button onClick={onNewDeclaration} className={btnDark}>
              New declaration
            </button>
          </div>
          <button onClick={onClose} className="mt-3 text-[11px] font-medium text-neutral-400 hover:text-neutral-700">
            Close
          </button>
        </div>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell onClose={onClose}>
        <div className="px-7 pb-6 pt-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-500">Not sent</p>
          <h2 className="mt-1 text-base font-semibold text-neutral-900">We couldn't email this submission</h2>
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">{error}</p>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            Your signed document is safe. You can retry, or download the PDF and sheet and forward them manually.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={submit} className={btnDark}>
              Try again
            </button>
            <button onClick={downloadPdf} disabled={!pdf} className={cn(btnLine, "disabled:opacity-40")}>
              Download PDF
            </button>
            <button onClick={downloadSheet} className={btnLine}>
              Download sheet
            </button>
            <button onClick={onClose} className={btnGhost}>
              Close
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose}>
      <div className="px-7 pb-2 pt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Submit</p>
        <h2 className="mt-0.5 text-lg font-semibold text-neutral-900">Review before sending</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
          A signed PDF and submission sheet will be emailed to <span className="font-medium text-neutral-900">{RECIPIENT}</span>.
        </p>
      </div>

      <ul className="mx-7 mt-3 divide-y divide-neutral-100 border-y border-neutral-100">
        {issues.map((i) => (
          <li key={i.label} className="flex items-center gap-3 py-2.5 text-xs">
            <Tick ok={i.ok} required={i.required} />
            <span className={cn("flex-1", i.ok ? "text-neutral-700" : i.required ? "font-medium text-neutral-900" : "text-neutral-500")}>
              {i.label}
            </span>
            {!i.ok && (
              <span className={cn("text-[10px] font-semibold uppercase tracking-wider", i.required ? "text-red-500" : "text-neutral-400")}>
                {i.required ? "Required" : "Pending"}
              </span>
            )}
          </li>
        ))}
      </ul>

      {!blocked && pendingOptional.length > 0 && (
        <p className="mx-7 mt-3 text-[11px] leading-relaxed text-neutral-500">
          Unsigned parties will be marked <span className="font-medium">Pending</span> in the running sheet.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 px-7 py-5">
        <span className="truncate text-[10px] text-neutral-400">Ref. {ref}</span>
        <div className="flex shrink-0 gap-2">
          <button onClick={onClose} className={btnGhost}>
            Back
          </button>
          <button onClick={submit} disabled={blocked} className={btnDark}>
            Submit &amp; email
          </button>
        </div>
      </div>
    </Shell>
  );
}
