import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Editable } from "./components/Editable";
import employees from "./data/employees.json";
import { Logo } from "./components/Logo";
import SettingsModal from "./components/SettingsModal";
import SignatureModal from "./components/SignatureModal";
import SubmitModal from "./components/SubmitModal";
import {
  DOC_TITLE,
  LEGAL_NAME,
  SIG_META,
  clearSaved,
  defaultDoc,
  loadDoc,
  saveDoc,
  todayISO,
  uid,
  type Asset,
  type DocState,
  type Fields,
  type Sig,
  type SigBlock,
  type SigKey,
} from "./lib/doc";
import { downloadBlob } from "./lib/download";
import { buildPdf } from "./lib/pdf";
import { cn } from "./utils/cn";

const lineInput =
  "w-full border-0 border-b border-neutral-200 bg-transparent px-0 pb-1.5 pt-1 text-[13px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-300 hover:border-neutral-400 focus:border-brand print:placeholder:text-transparent";

const cellInput =
  "block w-full bg-transparent px-1.5 py-2 text-[12px] text-neutral-800 outline-none transition-colors placeholder:text-neutral-300 hover:bg-brand/5 focus:bg-brand/10 print:placeholder:text-transparent print:hover:bg-transparent";

const fmtSigned = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

function Section({ n, title, children, className }: { n: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-3 flex items-center gap-3 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-neutral-900">
        <span className="text-sky-deep">{n}</span>
        {title}
        <span className="h-px flex-1 bg-neutral-200" />
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function PageFooter({ page, total }: { page: number; total: number }) {
  return (
    <footer className="mt-auto flex items-center justify-between border-t border-neutral-200 pt-3 text-[9px] uppercase tracking-[0.16em] text-neutral-400">
      <span className="font-semibold text-neutral-700">{LEGAL_NAME}</span>
      <span className="hidden sm:inline">{DOC_TITLE}</span>
      <span>
        Page {page} / {total}
      </span>
    </footer>
  );
}

function Sheet({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex min-h-[297mm] w-[210mm] shrink-0 flex-col bg-white px-[20mm] pb-[10mm] pt-[13mm] text-[12px] leading-[1.7] text-neutral-600",
        "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_50px_-18px_rgba(0,0,0,0.22)]",
        "print:min-h-[296.5mm] print:shadow-none",
        !last && "print:break-after-page",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] bg-sky" />
      {children}
    </div>
  );
}

function RemoveX({ onClick, title, className }: { onClick: () => void; title: string; className?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn("rounded-full p-1 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-800 print:hidden", className)}
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function SignatureBox({ block, onOpen, onClear }: { block: SigBlock; onOpen: () => void; onClear: () => void }) {
  const { sig } = block;
  return (
    <div className="group/sig relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-[60px] w-full items-end justify-start border-b border-neutral-800 pb-1 transition hover:bg-brand/5 print:hover:bg-transparent"
      >
        {sig ? (
          <img src={sig.image} alt="Signature" className="max-h-[52px] max-w-full object-contain object-left-bottom" />
        ) : (
          <span className="flex items-center gap-1.5 pb-1 pl-1 text-[11px] font-medium text-brand print:hidden">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Click to sign
          </span>
        )}
      </button>
      {sig && <RemoveX onClick={onClear} title="Remove signature" className="absolute right-0 top-0 bg-white opacity-0 group-hover/sig:opacity-100" />}
    </div>
  );
}

export default function App() {
  const [doc, setDoc] = useState<DocState>(loadDoc);
  const [resetKey, setResetKey] = useState(0);
  const [signing, setSigning] = useState<SigKey | null>(null);
  const [scale, setScale] = useState(1);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => saveDoc(doc), [doc]);

  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const patch = (p: Partial<DocState>) => setDoc((d) => ({ ...d, ...p }));

  const setField = (k: keyof Fields, v: string) =>
    setDoc((d) => {
      const fields = { ...d.fields, [k]: v };
      if (k === "employeeName" && d.fields.declName === d.fields.employeeName) fields.declName = v;
      return { ...d, fields };
    });

  const selectEmployee = (id: string) => {
    const employee = employees.find((e) => e.id === id);
    setDoc((d) => ({
      ...d,
      fields: {
        ...d.fields,
        employeeName: employee?.name ?? "",
        employeeId: employee?.id ?? "",
        designation: employee?.designation ?? "",
        department: employee?.department ?? "",
        declName: employee?.name ?? "",
      },
      sigs: defaultDoc().sigs,
    }));
  };

  const updateAsset = (id: number, k: keyof Asset, v: string) =>
    setDoc((d) => ({ ...d, assets: d.assets.map((a) => (a.id === id ? { ...a, [k]: v } : a)) }));

  const setSigBlock = (key: SigKey, p: Partial<SigBlock>) =>
    setDoc((d) => ({ ...d, sigs: { ...d.sigs, [key]: { ...d.sigs[key], ...p } } }));

  const applySignature = (sig: Sig) => {
    if (!signing) return;
    const b = doc.sigs[signing];
    setSigBlock(signing, {
      sig,
      signedAt: new Date().toISOString(),
      date: b.date || todayISO(),
      name: b.name || (signing === "employee" ? doc.fields.employeeName : "") || sig.text || "",
    });
    setSigning(null);
  };

  const startFresh = () => {
    clearSaved();
    setDoc(defaultDoc());
    setResetKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  };

  const reset = () => {
    if (window.confirm("Clear this form? All entries and signatures will be removed.")) startFresh();
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const ref = doc.fields.refNo.trim() || "draft";
      const built = await buildPdf(doc, ref);
      downloadBlob(built.blob, built.filename);
    } finally {
      setPdfBusy(false);
    }
  };

  const signedCount = SIG_META.filter((m) => doc.sigs[m.key].sig).length;
  const f = doc.fields;
  const activeMeta = SIG_META.find((m) => m.key === signing);

  return (
    <div className="min-h-screen print:bg-white">
      {/* ───────── Toolbar ───────── */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-3.5">
            <Logo height={34} />
            <span className="hidden h-6 w-px bg-neutral-200 sm:block" />
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 sm:block">Asset Declaration</p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="mr-1 flex items-center gap-2 text-[11px] font-medium text-neutral-500">
              <span className="flex gap-1">
                {SIG_META.map((m) => (
                  <span
                    key={m.key}
                    title={m.label}
                    className={cn("h-1.5 w-1.5 rounded-full", doc.sigs[m.key].sig ? "bg-brand" : "bg-neutral-300")}
                  />
                ))}
              </span>
              {signedCount} of {SIG_META.length} signed
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              title="Email settings"
              className="rounded-md p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </button>
            <button onClick={reset} className="rounded-md px-2.5 py-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800">
              Reset
            </button>
            <button
              onClick={downloadPdf}
              disabled={pdfBusy}
              className="rounded-md border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50"
            >
              {pdfBusy ? "Preparing…" : "Download PDF"}
            </button>
            <button
              onClick={() => setSubmitOpen(true)}
              className="rounded-md bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
            >
              Submit
            </button>
          </div>
        </div>
      </header>

      {/* ───────── Document ───────── */}
      <main
        key={resetKey}
        className="mx-auto flex flex-col items-center gap-8 px-2 pb-16 pt-6 [zoom:var(--z)] print:block print:p-0 print:[zoom:1]"
        style={{ "--z": scale } as CSSProperties}
      >
        <p className="print:hidden text-center text-[11px] text-neutral-400">
          Click any text to edit · fill in the fields · click a signature line to sign · then submit
        </p>

        {/* PAGE 1 */}
        <Sheet>
          {/* Letterhead */}
          <div className="flex items-start justify-between border-b border-neutral-200 pb-5">
            <Logo height={68} />
            <div className="w-44 pt-1">
              <Field label="Reference No.">
                <input
                  className={cn(lineInput, "text-right text-[12px] font-medium tracking-wide")}
                  value={f.refNo}
                  onChange={(e) => setField("refNo", e.target.value)}
                  placeholder="Reference"
                />
              </Field>
            </div>
          </div>

          {/* Title (per original form) */}
          <div className="py-7 text-center">
            <p className="text-[18px] font-extrabold tracking-[0.03em] text-ink">AMP FITNESS LLP</p>
            <h1 className="mt-1.5 text-[13px] font-bold uppercase tracking-[0.1em] text-ink">{DOC_TITLE}</h1>
            <div className="mx-auto mt-3 h-[2px] w-14 rounded-full bg-brand" />
          </div>

          {/* Employee details */}
          <div className="grid grid-cols-2 gap-x-10 gap-y-5">
            <Field label="Employee Name">
              <select aria-label="Employee Name" className={`${lineInput} print:appearance-none`} value={employees.some((e) => e.id === f.employeeId && e.name === f.employeeName) ? f.employeeId : ""} onChange={(e) => selectEmployee(e.target.value)}>
                <option value="">{f.employeeName || "Select employee"}</option>
                {["Active", "Inactive"].map((status) => (
                  <optgroup key={status} label={`${status} employees`}>
                    {employees.filter((e) => e.status === status).map((e) => (
                      <option key={e.id} value={e.id}>{e.name} · {e.id}{status === "Inactive" ? " (Inactive)" : ""}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Employee ID">
              <input className={lineInput} value={f.employeeId} onChange={(e) => setField("employeeId", e.target.value)} placeholder="Employee ID" />
            </Field>
            <Field label="Designation">
              <input className={lineInput} value={f.designation} onChange={(e) => setField("designation", e.target.value)} placeholder="Job title" />
            </Field>
            <Field label="Department">
              <input className={lineInput} value={f.department} onChange={(e) => setField("department", e.target.value)} placeholder="Department" />
            </Field>
            <Field label="Date & Time of Issue">
              <input type="datetime-local" className={lineInput} value={f.issueDate} onChange={(e) => setField("issueDate", e.target.value)} />
            </Field>
          </div>

          {/* Intro */}
          <p className="mt-7 text-[12.5px] leading-[1.8] text-neutral-700">
            I, Mr./Ms./Mrs.{" "}
            <input
              value={f.declName}
              onChange={(e) => setField("declName", e.target.value)}
              placeholder="your full name"
              size={Math.max(16, f.declName.length + 2)}
              className="mx-0.5 inline-block max-w-full border-0 border-b border-neutral-400 bg-transparent px-1 py-0 text-[12.5px] font-semibold text-neutral-900 outline-none transition-colors placeholder:font-normal placeholder:text-neutral-300 focus:border-neutral-900 print:placeholder:text-transparent"
            />
            {`, working at AMP Fitness${f.designation.trim() ? ` as ${f.designation.trim()}` : ""}`}
            <Editable value={doc.introRest} onChange={(v) => patch({ introRest: v })} />
          </p>

          {/* 01 Assets */}
          <Section n="01" title="Asset Details" className="mt-8">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-neutral-900 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  <th className="w-[7%] px-1.5 pb-2 pt-1 font-semibold">#</th>
                  <th className="w-[26%] px-1.5 pb-2 pt-1 font-semibold">Company Asset</th>
                  <th className="w-[22%] px-1.5 pb-2 pt-1 font-semibold">Asset / Serial No.</th>
                  <th className="w-[19%] px-1.5 pb-2 pt-1 font-semibold">Condition at Issue</th>
                  <th className="px-1.5 pb-2 pt-1 font-semibold">Remarks</th>
                  <th className="w-6 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {doc.assets.map((a, i) => (
                  <tr key={a.id} className="group border-b border-neutral-200">
                    <td className="px-1.5 py-2 text-[11px] tabular-nums text-neutral-400">{String(i + 1).padStart(2, "0")}</td>
                    <td>
                      <input className={cn(cellInput, "font-semibold text-neutral-900")} value={a.name} onChange={(e) => updateAsset(a.id, "name", e.target.value)} placeholder="Asset" />
                    </td>
                    <td>
                      <input className={cellInput} value={a.serial} onChange={(e) => updateAsset(a.id, "serial", e.target.value)} placeholder="Serial no." />
                    </td>
                    <td>
                      <input list="conditions" className={cellInput} value={a.condition} onChange={(e) => updateAsset(a.id, "condition", e.target.value)} placeholder="e.g. Good" />
                    </td>
                    <td>
                      <input className={cellInput} value={a.remarks} onChange={(e) => updateAsset(a.id, "remarks", e.target.value)} placeholder="Remarks" />
                    </td>
                    <td className="text-center print:hidden">
                      <RemoveX
                        onClick={() => patch({ assets: doc.assets.filter((x) => x.id !== a.id) })}
                        title="Remove row"
                        className="opacity-0 group-hover:opacity-100"
                      />
                    </td>
                  </tr>
                ))}
                {doc.assets.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-xs text-neutral-400">
                      No assets listed – add a row below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <datalist id="conditions">
              <option value="New" />
              <option value="Good" />
              <option value="Fair" />
              <option value="Needs repair" />
            </datalist>
            <button
              onClick={() => patch({ assets: [...doc.assets, { id: uid(), name: "", serial: "", condition: "", remarks: "" }] })}
              className="mt-2 text-[11px] font-semibold text-sky-deep transition hover:text-neutral-900 print:hidden"
            >
              + Add asset
            </button>
          </Section>

          <Section n="02" title="Objective" className="mt-7">
            <Editable value={doc.objective} onChange={(v) => patch({ objective: v })} className="block" />
          </Section>

          <Section n="03" title="Scope" className="mt-7">
            <Editable value={doc.scope} onChange={(v) => patch({ scope: v })} className="block" />
          </Section>

          <div className="h-6" />
          <PageFooter page={1} total={2} />
        </Sheet>

        {/* PAGE 2 */}
        <Sheet last>
          <div className="mb-6 flex items-center justify-between border-b border-neutral-200 pb-3">
            <Logo height={34} />
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              {f.employeeName ? f.employeeName : "Asset Declaration"}
              {f.refNo ? ` · ${f.refNo}` : ""}
            </p>
          </div>

          <Section n="04" title="Terms & Conditions">
            <ol className="space-y-2.5 text-[11.5px] leading-[1.65]">
              {doc.terms.map((t, i) => (
                <li key={t.id} className="group relative flex gap-4">
                  <span className="w-5 shrink-0 pt-px text-[10.5px] font-semibold tabular-nums text-sky-deep">{String(i + 1).padStart(2, "0")}</span>
                  <Editable
                    value={t.text}
                    onChange={(v) => patch({ terms: doc.terms.map((x) => (x.id === t.id ? { ...x, text: v } : x)) })}
                    className="block flex-1"
                  />
                  <RemoveX
                    onClick={() => patch({ terms: doc.terms.filter((x) => x.id !== t.id) })}
                    title="Remove clause"
                    className="absolute -right-7 top-0 opacity-0 group-hover:opacity-100"
                  />
                </li>
              ))}
            </ol>
            <button
              onClick={() => patch({ terms: [...doc.terms, { id: uid(), text: "New clause – click to edit." }] })}
              className="mt-2 text-[11px] font-semibold text-brand transition hover:text-brand-dark print:hidden"
            >
              + Add clause
            </button>
          </Section>

          <Section n="05" title="Employee Declaration & Undertaking" className="mt-7 break-inside-avoid">
            <div className="border-l-2 border-brand pl-5 text-[11.5px] leading-[1.7] text-neutral-700">
              <Editable value={doc.declaration1} onChange={(v) => patch({ declaration1: v })} className="block" />
              <Editable value={doc.declaration2} onChange={(v) => patch({ declaration2: v })} className="mt-2.5 block" />
            </div>
          </Section>

          <Section n="06" title="Signatures" className="mt-7 break-inside-avoid">
            <div className="grid grid-cols-3 gap-8">
              {SIG_META.map((m) => {
                const b = doc.sigs[m.key];
                return (
                  <div key={m.key}>
                    <p className="min-h-[2.4em] text-[8.5px] font-semibold uppercase leading-[1.35] tracking-[0.14em] text-neutral-900">{m.label}</p>
                    <SignatureBox block={b} onOpen={() => setSigning(m.key)} onClear={() => setSigBlock(m.key, { sig: null, signedAt: null })} />
                    <input
                      className={cn(lineInput, "mt-2")}
                      value={b.name}
                      onChange={(e) => setSigBlock(m.key, { name: e.target.value })}
                      placeholder="Printed name"
                    />
                    <input type="date" className={cn(lineInput, "mt-2 text-[12px]")} value={b.date} onChange={(e) => setSigBlock(m.key, { date: e.target.value })} />
                    <p className="mt-1.5 h-3 text-[8.5px] tracking-wide text-neutral-400">
                      {b.signedAt ? `Signed electronically · ${fmtSigned(b.signedAt)}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>

          <div className="h-5" />
          <PageFooter page={2} total={2} />
        </Sheet>

        <div className="print:hidden flex w-[210mm] max-w-full flex-col items-center gap-3 pt-2">
          <button
            onClick={() => setSubmitOpen(true)}
            className="rounded-md bg-neutral-900 px-8 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-black"
          >
            Submit signed declaration
          </button>
          <p className="text-[11px] text-neutral-400">
            A signed PDF and the updated running submissions sheet are emailed to Admin / Operations through Mailtrap.
          </p>
        </div>
      </main>

      {signing && activeMeta && (
        <SignatureModal
          title={activeMeta.label}
          defaultName={doc.sigs[signing].name || (signing === "employee" ? doc.fields.employeeName : "")}
          onClose={() => setSigning(null)}
          onSave={applySignature}
        />
      )}
      {submitOpen && (
        <SubmitModal
          state={doc}
          onClose={() => setSubmitOpen(false)}
          onNewDeclaration={() => {
            setSubmitOpen(false);
            startFresh();
          }}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
