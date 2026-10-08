import { useCallback, useEffect, useState } from 'react';
import employees from '../data/employees.json';
import { Logo } from './Logo';
import SignatureModal from './SignatureModal';
import { adminRequest, ApiError, pdfUrl, type AdminItem, type SignaturePresets } from '../lib/admin';
import { defaultDoc, SIG_META, todayISO, uid, type DocState, type Sig, type SigKey } from '../lib/doc';
import { buildPdf } from '../lib/pdf';
import { downloadBlob } from '../lib/download';

const button = 'rounded-lg bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40';
const secondary = 'rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:border-neutral-400 disabled:opacity-40';
const input = 'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 disabled:bg-neutral-50 disabled:text-neutral-500';
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
function Status({ value }: { value: string }) {
  const color = value === 'Complete' ? 'bg-emerald-50 text-emerald-700' : value.includes('Failed') ? 'bg-red-50 text-red-700' : value === 'Draft' ? 'bg-neutral-100 text-neutral-600' : 'bg-sky-50 text-sky-700';
  return <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${color}`}>{value}</span>;
}
const noPresets: SignaturePresets = { handover: null, admin: null };
const ADMIN_KEYS = ['handover', 'admin'] as const;
// New declarations start with the saved handover and admin signatures already in place.
function withPresets(doc: DocState, presets: SignaturePresets): DocState {
  const sigs = { ...doc.sigs };
  for (const key of ADMIN_KEYS) {
    const preset = presets[key];
    if (preset) sigs[key] = { sig: preset.sig, name: preset.name, date: todayISO(), signedAt: preset.sig ? new Date().toISOString() : null };
  }
  return { ...doc, sigs };
}
const submitted = (item: AdminItem) => !item.legacy && item.signatures.employee;
export default function AdminCenter() {
  const [auth, setAuth] = useState<'checking' | 'locked' | 'open'>('checking');
  const [code, setCode] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<AdminItem[]>([]); const [synced, setSynced] = useState('');
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('All');
  const [editing, setEditing] = useState<AdminItem | 'new' | null>(null);
  const [legacy, setLegacy] = useState<AdminItem | null>(null);
  const [viewing, setViewing] = useState<AdminItem | null>(null);
  const [presets, setPresets] = useState<SignaturePresets>(noPresets); const [managingPresets, setManagingPresets] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await adminRequest<{ documents: AdminItem[]; updatedAt: string }>('list');
      setItems(result.documents); setSynced(result.updatedAt); setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setAuth('locked'); setItems([]); }
      setError(e instanceof Error ? e.message : 'Could not refresh submissions.');
    }
  }, []);
  useEffect(() => { let alive = true; adminRequest('session').then(() => { if (alive) setAuth('open'); }).catch(e => { if (alive) { setAuth('locked'); if (e.status !== 401) setError(e.message); } }); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (auth !== 'open') return;
    void refresh(); adminRequest<{ presets: SignaturePresets }>('presets').then(r => setPresets(r.presets)).catch(() => {});
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => window.clearInterval(interval);
  }, [auth, refresh]);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await adminRequest('login', { code }); setCode(''); setAuth('open'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to unlock.'); }
    finally { setBusy(false); }
  }
  const openItem = async (item: AdminItem) => {
    if (item.legacy) { setLegacy(item); return; }
    try { const result = await adminRequest<{ item: AdminItem }>('document', undefined, { id: item.id }); setEditing(result.item); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open document.'); }
  };
  if (auth !== 'open') return <div className="flex min-h-screen items-center justify-center bg-[#f5f6f7] p-5">
    <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <Logo height={65} /><p className="mt-8 text-[10px] font-semibold uppercase tracking-[.2em] text-neutral-400">Restricted workspace</p>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Admin center</h1><p className="mt-2 text-sm leading-relaxed text-neutral-500">Enter your access code to manage declarations, signatures and invitations.</p>
      {auth === 'checking' ? <p className="mt-6 text-sm text-neutral-500">Checking your session…</p> : <form onSubmit={login} className="mt-6 space-y-4">
        <label className="block text-xs font-medium text-neutral-700">Secret code<input type="password" inputMode="numeric" autoComplete="off" autoFocus value={code} onChange={e => setCode(e.target.value)} className={`${input} mt-2 tracking-[.3em]`} required /></label>
        {error && <p role="alert" className="text-xs leading-relaxed text-red-600">{error}</p>}
        <button disabled={busy || !code} className={`${button} w-full`}>{busy ? 'Unlocking…' : 'Unlock admin center'}</button>
      </form>}
      <a href="#/" className="mt-6 block text-xs text-neutral-500 hover:text-neutral-900">← Employee declaration</a>
    </div>
  </div>;
  const visible = items.filter(i => `${i.employeeName} ${i.employeeId} ${i.ref} ${i.recipientEmail}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'All' || i.status === filter || (filter === 'Submitted by employee' && i.signatures.employee) || (filter === 'Email failed' && i.emails.some(m => m.status === 'Failed'))));
  const cards = [ ['All declarations', items.length], ['Awaiting employee', items.filter(i => !i.signatures.employee && i.status !== 'Draft').length], ['Awaiting admin', items.filter(i => i.signatures.employee && (!i.signatures.handover || !i.signatures.admin)).length], ['Submitted PDFs', items.filter(i => i.signatures.employee).length], ['Fully signed', items.filter(i => i.status === 'Complete').length] ];
  return <div className="min-h-screen bg-[#f6f7f8] text-neutral-900">
    <header className="border-b border-neutral-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-center gap-4"><Logo height={42} /><div className="border-l border-neutral-200 pl-4"><p className="text-[10px] uppercase tracking-[.18em] text-neutral-400">Physique 57 India</p><h1 className="text-lg font-semibold">Admin center</h1></div></div>
      <div className="flex items-center gap-3"><a href="#/" className="text-xs text-neutral-500">Employee form ↗</a><button className={secondary} onClick={async () => { try { await adminRequest('logout', {}); setAuth('locked'); setEditing(null); setItems([]); } catch (e) { setError(e instanceof Error ? e.message : 'Logout failed.'); } }}>Lock admin center</button></div>
    </div></header>
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-sky-600">Declarations & asset handovers</p><h2 className="mt-1 text-3xl font-semibold tracking-tight">Signature workspace</h2><p className="mt-2 text-sm text-neutral-500">Prepare, countersign and track every employee declaration.</p></div><button className={button} onClick={() => setEditing('new')}>+ New declaration / bulk template</button></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{cards.map(([label, value]) => <div key={label} className="rounded-xl border border-neutral-200 bg-white px-5 py-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p></div>)}</div>
      {error && <div role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4"><div><h3 className="text-sm font-semibold">All declarations & submissions</h3><p className="mt-1 text-[11px] text-neutral-400"><span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${error ? 'bg-amber-400' : 'bg-emerald-500'}`} />{error ? 'Refresh interrupted' : 'Auto-refresh every 5 seconds'}{synced ? ` · Last sync ${fmt(synced)}` : ' · Loading…'}</p></div><div className="flex gap-2"><button className={secondary} onClick={() => setManagingPresets(true)}>Signature presets</button><a href="/api/admin?action=sheet" className={secondary}>Download shared sheet</a><button className={secondary} onClick={() => void refresh()}>Refresh</button></div></div>
        <div className="flex flex-wrap gap-3 px-5 py-3"><input aria-label="Search declarations" placeholder="Search employee, reference or email" className={`${input} max-w-sm`} value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter by status" className={`${input} max-w-xs`} value={filter} onChange={e => setFilter(e.target.value)}>{['All','Submitted by employee','Draft','Awaiting employee signature','Opened · awaiting signature','Awaiting admin signatures','Complete','Email failed'].map(s => <option key={s}>{s}</option>)}</select></div>
        <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500"><tr>{['Employee / reference','Progress','Signatures','Submitted','Latest email','Updated',''].map((v,i) => <th key={i} className="px-5 py-3 font-medium">{v}</th>)}</tr></thead><tbody className="divide-y divide-neutral-100">{visible.map(item => <tr key={item.id} className="hover:bg-neutral-50/70"><td className="px-5 py-4"><p className="font-semibold">{item.employeeName || 'Bulk template'}</p><p className="mt-1 text-[10px] text-neutral-400">{item.ref}{item.legacy ? ' · Earlier submission' : ''}</p><p className="mt-1 text-[11px] text-neutral-500">{item.recipientEmail || item.department}</p></td><td className="px-5 py-4"><Status value={item.status} /></td><td className="px-5 py-4"><div className="flex gap-2">{SIG_META.map(m => <span key={m.key} title={`${m.label}: ${item.signatures[m.key] ? 'Signed' : 'Pending'}`} className={`rounded-md border px-2 py-1 text-[10px] ${item.signatures[m.key] ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-neutral-200 text-neutral-400'}`}>{m.key === 'employee' ? 'Employee' : m.key === 'handover' ? 'Handover' : 'Verified'} {item.signatures[m.key] ? '✓' : '—'}</span>)}</div></td><td className="px-5 py-4 text-neutral-500">{fmt(item.submittedAt)}</td><td className="px-5 py-4">{item.emails.length ? <><Status value={item.emails.slice(-1)[0].status} /><p className="mt-1 max-w-48 truncate text-[10px] text-neutral-400">{item.emails.slice(-1)[0].to}</p></> : <span className="text-neutral-400">{item.legacy ? 'Not tracked' : 'Not sent'}</span>}</td><td className="px-5 py-4 text-neutral-500">{fmt(item.updatedAt)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2">{submitted(item) && <button className={secondary} onClick={() => setViewing(item)}>View PDF</button>}<button className={secondary} onClick={() => void openItem(item)}>{item.legacy ? 'Details' : 'Open / sign'}</button></div></td></tr>)}</tbody></table>{!visible.length && <div className="px-6 py-14 text-center text-sm text-neutral-400">{!synced ? 'Loading shared records…' : items.length ? 'No declarations match these filters.' : 'No declarations yet. Create a template to start.'}</div>}</div>
        <p className="border-t border-neutral-100 px-5 py-3 text-[11px] text-neutral-400">Accepted means Mailtrap accepted the email. Signing progress updates when recipients open and submit their private links.</p>
      </section>
    </main>
    {editing && <AdminEditor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} presets={presets} onPresets={setPresets} onClose={() => { setEditing(null); void refresh(); }} onSaved={() => void refresh()} />}
    {viewing && <PdfViewer item={viewing} onClose={() => setViewing(null)} />}
    {managingPresets && <PresetsModal presets={presets} onClose={() => setManagingPresets(false)} onSaved={setPresets} />}
    {legacy && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-5"><div className="w-full max-w-md rounded-xl bg-white p-6"><h2 className="text-lg font-semibold">Earlier submission</h2><p className="mt-3 text-sm">{legacy.employeeName} · {legacy.ref}</p><p className="mt-2 text-sm text-neutral-500">{legacy.designation} · {legacy.department}</p><div className="mt-4"><Status value={legacy.status} /></div><p className="mt-4 text-xs leading-relaxed text-neutral-500">This record was submitted before full documents were stored. Its signature status is included in the shared sheet. To countersign its original PDF, use the emailed copy; new submissions can be signed here.</p><button className={`${button} mt-5`} onClick={() => setLegacy(null)}>Close</button></div></div>}
  </div>;
}
function PdfViewer({ item, onClose }: { item: AdminItem; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
    <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3"><div><p className="text-[10px] uppercase tracking-widest text-neutral-400">{item.ref} · Submitted {fmt(item.submittedAt)}</p><h2 className="mt-1 text-sm font-semibold">{item.employeeName}</h2></div><div className="flex gap-2"><a className={secondary} href={pdfUrl(item.id)} target="_blank" rel="noopener">Open in new tab ↗</a><a className={secondary} href={pdfUrl(item.id, false)}>Download PDF</a><button className={button} onClick={onClose}>Close</button></div></div>
      <iframe key={`${item.id}:${item.revision}`} src={pdfUrl(item.id)} title={`${item.employeeName} submitted declaration`} className="w-full flex-1 bg-neutral-100" />
    </div>
  </div>;
}
function PresetsModal({ presets, onClose, onSaved }: { presets: SignaturePresets; onClose: () => void; onSaved: (presets: SignaturePresets) => void }) {
  const [draft, setDraft] = useState(presets); const [signing, setSigning] = useState<'handover' | 'admin' | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      const cleaned = Object.fromEntries(ADMIN_KEYS.map(k => [k, draft[k]?.name.trim() ? { name: draft[k]!.name.trim(), sig: draft[k]!.sig } : null]));
      const result = await adminRequest<{ presets: SignaturePresets }>('presets', { presets: cleaned });
      onSaved(result.presets); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save presets.'); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-5">
    <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">Signature presets</h2><p className="mt-2 text-sm leading-relaxed text-neutral-500">These names and signatures prefill Handed Over By and Admin / Operations Verification on every new declaration and bulk template you share. You can still change them per document.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{SIG_META.filter(m => m.key !== 'employee').map(m => { const key = m.key as 'handover' | 'admin'; const preset = draft[key]; return <div key={key} className="rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-semibold">{m.label}</p>
        <input aria-label={`${m.label} preset name`} disabled={busy} value={preset?.name || ''} className={`${input} mt-3`} placeholder="Signatory's printed name" onChange={e => setDraft({ ...draft, [key]: { name: e.target.value, sig: preset?.sig || null } })} />
        <button disabled={busy} onClick={() => setSigning(key)} className="mt-3 flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-xs text-sky-700">{preset?.sig ? <img src={preset.sig.image} alt={`${m.label} preset signature`} className="max-h-16 max-w-full" /> : 'Draw or type the preset signature'}</button>
        {(preset?.name || preset?.sig) && <button disabled={busy} className="mt-2 text-[11px] text-red-500" onClick={() => setDraft({ ...draft, [key]: null })}>Clear preset</button>}
      </div>; })}</div>
      <div className="mt-6 flex justify-end gap-2"><button disabled={busy} className={secondary} onClick={onClose}>Cancel</button><button disabled={busy} className={button} onClick={() => void save()}>{busy ? 'Saving…' : 'Save presets'}</button></div>
    </div>
    {signing && <SignatureModal title={`${SIG_META.find(m => m.key === signing)!.label} preset`} defaultName={draft[signing]?.name || ''} onClose={() => setSigning(null)} onSave={sig => { setDraft({ ...draft, [signing]: { name: draft[signing]?.name.trim() || sig.text || '', sig } }); setSigning(null); }} />}
  </div>;
}
function AdminEditor({ initial, presets, onPresets, onClose, onSaved }: { initial: AdminItem | null; presets: SignaturePresets; onPresets: (presets: SignaturePresets) => void; onClose: () => void; onSaved: () => void }) {
  const [item, setItem] = useState(initial); const [doc, setDoc] = useState<DocState>(() => initial?.document || withPresets(defaultDoc(), presets));
  const [recipientEmail, setRecipientEmail] = useState(initial?.recipientEmail || '');
  const [signing, setSigning] = useState<SigKey | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'document' | 'bulk' | 'history'>('document');
  const [selected, setSelected] = useState<string[]>([]); const [emails, setEmails] = useState<Record<string,string>>(() => Object.fromEntries(employees.map(e => [e.id,e.email])));
  const [sendTo, setSendTo] = useState(initial?.recipientEmail ? `${initial.recipientEmail}, jimmeey@physique57india.com` : 'jimmeey@physique57india.com');
  const [preview, setPreview] = useState(''); const [progress, setProgress] = useState(''); const [dirty, setDirty] = useState(!initial);
  const [bulkResults, setBulkResults] = useState<{ failed: number; error?: string; item?: AdminItem; employeeId?: string }[]>([]);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const issued = Boolean(item?.invitedAt || item?.submittedAt);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const change = (next: DocState) => { setDoc(next); setDirty(true); setMessage(''); };
  const pick = (id: string) => { const employee = employees.find(e => e.id === id); change({ ...doc, fields: { ...doc.fields, employeeName: employee?.name || '', employeeId: employee?.id || '', declName: employee?.name || '', designation: employee?.designation || '', department: employee?.department || '' } }); setRecipientEmail(employee?.email || ''); if (employee?.email) setSendTo(`${employee.email}, jimmeey@physique57india.com`); };
  async function save() {
    setError('');
    const result = await adminRequest<{ item: AdminItem }>('save', { id: item?.id, revision: item?.revision, document: doc, recipientEmail });
    setItem(result.item); setDoc(result.item.document!); setDirty(false); setMessage('Declaration and admin signatures saved.'); onSaved(); return result.item;
  }
  async function perform(work: () => Promise<void>) { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'The operation failed.'); } finally { setBusy(false); } }
  function sign(sig: Sig) {
    if (!signing) return;
    const block = doc.sigs[signing]; const name = block.name.trim() || sig.text || '';
    if (!name) { setError('Enter the signatory’s printed name before saving a drawn signature.'); return; }
    change({ ...doc, sigs: { ...doc.sigs, [signing]: { ...block, sig, name, date: block.date || todayISO(), signedAt: new Date().toISOString() } } }); setSigning(null);
  }
  async function previewPdf() { const pdf = await buildPdf(doc, doc.fields.refNo); setPreview(URL.createObjectURL(pdf.blob)); }
  async function sendCompleted() {
    const current = dirty ? await save() : item!;
    const recipients = sendTo.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const result = await adminRequest<{ item: AdminItem; failed: number }>('email', { id: current.id, revision: current.revision, recipients });
    setItem(result.item); setMessage(result.failed ? `${result.failed} email(s) failed. Review the email history and retry.` : 'Completed documents accepted by Mailtrap.'); onSaved();
  }
  async function sendBulk() {
    const current = dirty ? await save() : item!;
    const results: typeof bulkResults = [];
    for (let i = 0; i < selected.length; i += 5) {
      setProgress(`Processing ${Math.min(i + 5, selected.length)} of ${selected.length} recipients…`);
      const result = await adminRequest<{ results: typeof bulkResults }>('invite', { id: current.id, revision: current.revision, batchId, recipients: selected.slice(i, i + 5).map(employeeId => ({ employeeId, email: emails[employeeId] })) });
      results.push(...result.results); setBulkResults([...results]); onSaved();
    }
    setProgress(''); const failed = results.filter(r => r.failed).length;
    setMessage(`${results.length - failed} invitation(s) accepted${failed ? ` · ${failed} failed. Retry uses the same batch and skips invitations already accepted.` : '.'}`);
  }
  const adminSigned = Boolean(doc.sigs.handover.sig && doc.sigs.admin.sig);
  return <div className="fixed inset-0 z-40 flex justify-end bg-black/35 backdrop-blur-[2px]">
    <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4"><div><p className="text-[10px] uppercase tracking-widest text-neutral-400">{item?.ref || 'New declaration'}</p><h2 className="mt-1 text-lg font-semibold">{doc.fields.employeeName || 'Presigned bulk template'}</h2></div><button disabled={busy} className={secondary} onClick={() => { if (!dirty || window.confirm('Close without saving your changes?')) onClose(); }}>Close ✕</button></div>
      <div className="flex gap-6 border-b border-neutral-100 px-6">{(['document','bulk','history'] as const).map(t => <button key={t} disabled={busy} onClick={() => setTab(t)} className={`border-b-2 py-3 text-xs font-semibold capitalize ${tab === t ? 'border-sky-400 text-neutral-900' : 'border-transparent text-neutral-400'}`}>{t === 'bulk' ? 'Recipients & invitations' : t === 'history' ? 'Activity & email history' : 'Document & signatures'}</button>)}</div>
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}{message && <p role="status" className="rounded-lg bg-sky-50 p-3 text-xs text-sky-800">{message}</p>}
        {tab === 'document' && <>
          {issued && <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">This declaration has been issued. Its employee, assets and terms are locked; you can add the two admin signatures.</p>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">Employee<select disabled={issued || busy} value={doc.fields.employeeId} className={`${input} mt-2`} onChange={e => pick(e.target.value)}><option value="">Bulk template · personalize per recipient</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name} · {e.id}</option>)}</select></label><label className="text-xs font-medium">Recipient email<input type="email" disabled={issued || busy} className={`${input} mt-2`} value={recipientEmail} onChange={e => { setRecipientEmail(e.target.value); setDirty(true); }} placeholder="employee@company.com" /></label><div><p className="text-xs font-medium">Designation</p><p className="mt-2 text-sm text-neutral-500">{doc.fields.designation || 'Personalized from employee directory'}</p></div><div><p className="text-xs font-medium">Department</p><p className="mt-2 text-sm text-neutral-500">{doc.fields.department || 'Personalized from employee directory'}</p></div><label className="text-xs font-medium">Issue date & time<input disabled={issued || busy} type="datetime-local" className={`${input} mt-2`} value={doc.fields.issueDate} onChange={e => change({ ...doc, fields: { ...doc.fields, issueDate: e.target.value } })} /></label></div>
          <section><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Company assets</h3>{!issued && <button disabled={busy} className={secondary} onClick={() => change({ ...doc, assets: [...doc.assets,{ id:uid(),name:'',serial:'',condition:'',remarks:'' }] })}>+ Add asset</button>}</div><div className="space-y-2">{doc.assets.map(a => <div key={a.id} className="grid gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-2">{(['name','serial','condition','remarks'] as const).map(k => <input key={k} aria-label={`Asset ${a.id} ${k}`} disabled={issued || busy} className={input} placeholder={k === 'name' ? 'Asset name' : k === 'serial' ? 'Serial number' : k === 'condition' ? 'Condition' : 'Remarks'} value={a[k]} onChange={e => change({ ...doc, assets:doc.assets.map(x => x.id === a.id ? { ...x,[k]:e.target.value } : x) })} />)}{!issued && <button disabled={busy} className="text-left text-[11px] text-red-500" onClick={() => change({ ...doc, assets:doc.assets.filter(x => x.id !== a.id) })}>Remove asset</button>}</div>)}</div></section>
          <section><h3 className="mb-3 text-sm font-semibold">Admin signatures</h3><div className="grid gap-4 sm:grid-cols-2">{SIG_META.filter(m => m.key !== 'employee').map(m => <div key={m.key} className="rounded-xl border border-neutral-200 p-4"><p className="text-xs font-semibold">{m.label}</p><input aria-label={`${m.label} printed name`} disabled={busy} value={doc.sigs[m.key].name} className={`${input} mt-3`} placeholder="Signatory's printed name" onChange={e => change({ ...doc, sigs:{ ...doc.sigs,[m.key]:{ ...doc.sigs[m.key],name:e.target.value } } })} /><button disabled={busy} onClick={() => setSigning(m.key)} className="mt-3 flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-xs text-sky-700">{doc.sigs[m.key].sig ? <img src={doc.sigs[m.key].sig!.image} alt={`${m.label} signature`} className="max-h-16 max-w-full" /> : 'Draw or type your signature'}</button><p className="mt-2 text-[10px] text-neutral-400">{doc.sigs[m.key].sig ? `Signed · ${doc.sigs[m.key].name}` : 'Pending signature'}</p><div className="mt-2 flex flex-wrap gap-3 text-[11px]">{presets[m.key as 'handover' | 'admin'] && <button disabled={busy} className="text-sky-700 hover:underline" onClick={() => change(withPresets(doc, { ...noPresets, [m.key]: presets[m.key as 'handover' | 'admin'] }))}>Use saved preset</button>}{doc.sigs[m.key].name.trim() && <button disabled={busy} className="text-neutral-500 hover:underline" onClick={() => void perform(async () => { const result = await adminRequest<{ presets: SignaturePresets }>('presets', { presets: { ...presets, [m.key]: { name: doc.sigs[m.key].name.trim(), sig: doc.sigs[m.key].sig } } }); onPresets(result.presets); setMessage(`${m.label} saved as the default for new declarations.`); })}>Save as preset</button>}</div></div>)}</div><p className="mt-3 text-xs text-neutral-500">Employee signature: {doc.sigs.employee.sig ? `Signed by ${doc.sigs.employee.name}` : 'Awaiting employee · only the recipient can add this signature.'}</p></section>
          {item?.submittedAt && <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Submitted PDF</h3><p className="mt-1 text-xs text-neutral-500">Signed by {doc.sigs.employee.name || item.employeeName} · {fmt(item.submittedAt)}</p></div><div className="flex gap-2"><a className={secondary} href={pdfUrl(item.id)} target="_blank" rel="noopener">Open ↗</a><a className={secondary} href={pdfUrl(item.id, false)}>Download</a></div></div><iframe key={item.revision} src={pdfUrl(item.id)} title="Submitted declaration PDF" className="mt-3 h-[580px] w-full rounded-lg border border-neutral-200 bg-white" /></section>}
          <div className="flex flex-wrap gap-2"><button disabled={busy} className={secondary} onClick={() => void perform(previewPdf)}>Preview document</button><button disabled={busy} className={secondary} onClick={() => void perform(async () => { const pdf = await buildPdf(doc,doc.fields.refNo); downloadBlob(pdf.blob,pdf.filename); })}>Download PDF</button></div>{preview && <iframe src={preview} title="Declaration PDF preview" className="h-[580px] w-full rounded-lg border border-neutral-200" />}
          {doc.sigs.employee.sig && <section className="rounded-xl border border-neutral-200 p-4"><h3 className="text-sm font-semibold">Email completed declaration</h3><p className="mt-1 text-xs text-neutral-500">Send the fully signed PDF and shared submissions sheet to these recipients.</p><label className="mt-3 block text-xs">Email addresses, separated by commas<textarea className={`${input} mt-2`} value={sendTo} onChange={e => setSendTo(e.target.value)} rows={2} /></label><button disabled={busy || !adminSigned} className={`${button} mt-3`} onClick={() => void perform(sendCompleted)}>Send completed PDF</button></section>}
        </>}
        {tab === 'bulk' && <>
          <h3 className="text-lg font-semibold">Presigned invitations</h3><p className="text-sm leading-relaxed text-neutral-500">Each selected employee receives a personalized PDF with both admin signatures and a private link to review, sign and submit. The employee signature stays blank until they sign.</p>
          {!adminSigned && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Add both admin signatures in the Document tab before sending.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold">{selected.length} recipient(s) selected</span><button disabled={busy} className={secondary} onClick={() => { setSelected(selected.length ? [] : employees.filter(e => e.status === 'Active' && e.designation && e.department).map(e => e.id)); setBatchId(crypto.randomUUID()); setBulkResults([]); }}>{selected.length ? 'Clear selection' : 'Select active employees'}</button></div>
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">{employees.filter(e => e.status === 'Active').map(e => <div key={e.id} className="flex flex-wrap items-center gap-3 p-3"><input type="checkbox" aria-label={`Invite ${e.name} ${e.id}`} disabled={busy} checked={selected.includes(e.id)} onChange={event => { setSelected(event.target.checked ? [...selected,e.id] : selected.filter(id => id !== e.id)); setBatchId(crypto.randomUUID()); setBulkResults([]); }} /><div className="min-w-40 flex-1"><p className="text-xs font-semibold">{e.name} <span className="font-normal text-neutral-400">· {e.id}</span></p><p className="mt-1 text-[10px] text-neutral-400">{e.designation}</p></div><input aria-label={`${e.name} recipient email`} type="email" disabled={busy} className={`${input} max-w-xs`} value={emails[e.id] || ''} onChange={event => { setEmails({ ...emails,[e.id]:event.target.value }); setBatchId(crypto.randomUUID()); }} /></div>)}</div>
          <div className="rounded-xl bg-neutral-50 p-4"><p className="text-xs leading-relaxed text-neutral-600">Send {selected.length} personalized invitation(s) with the assets and terms in this template. Review the PDF and recipient emails before sending.</p><button disabled={busy || !selected.length || !adminSigned || selected.some(id => !emails[id])} className={`${button} mt-3`} onClick={() => void perform(sendBulk)}>{busy ? progress || 'Preparing invitations…' : 'Send presigned invitations'}</button></div>
          {bulkResults.length > 0 && <ul className="space-y-2">{bulkResults.map((r,i) => <li key={i} className="rounded-lg border border-neutral-200 p-3 text-xs"><b>{r.item?.employeeName || employees.find(e => e.id === r.employeeId)?.name || 'Recipient'}</b> · {r.failed ? 'Failed' : 'Accepted'}{r.error && <p className="mt-1 text-red-600">{r.error}</p>}{r.item?.emails.filter(m => m.status === 'Failed').map(m => <p key={m.key} className="mt-1 text-red-600">{m.error}</p>)}</li>)}</ul>}
        </>}
        {tab === 'history' && <>{item?.recipientEmail && !item.submittedAt && <button disabled={busy || dirty} className={secondary} onClick={() => void perform(async () => { const result = await adminRequest<{ item: AdminItem; failed: number }>('reinvite', { id:item.id, revision:item.revision }); setItem(result.item); setMessage(result.failed ? 'Invitation email failed. See the email history.' : 'New signing link accepted for email delivery.'); onSaved(); })}>Resend private signing invitation</button>}<h3 className="text-lg font-semibold">Activity & email history</h3><p className="text-xs text-neutral-400">Save this declaration to start its activity history.</p>{item?.emails.map(m => <div key={m.key} className="rounded-xl border border-neutral-200 p-4"><div className="flex justify-between"><p className="text-xs font-semibold">{m.kind} · {m.to}</p><Status value={m.status} /></div><p className="mt-2 text-[11px] text-neutral-400">{fmt(m.at)}</p>{m.error && <p className="mt-2 text-xs text-red-600">{m.error}</p>}</div>)}{item?.events?.slice().reverse().map((e,i) => <div key={i} className="border-l-2 border-sky-200 py-1 pl-4"><p className="text-xs font-semibold">{e.type}</p><p className="mt-1 text-xs text-neutral-500">{e.detail}</p><p className="mt-1 text-[10px] text-neutral-400">{fmt(e.at)}</p></div>)}</>}
      </div>
      <div className="flex items-center justify-between border-t border-neutral-200 bg-white px-6 py-4"><span className="text-[11px] text-neutral-400">{dirty ? 'Unsaved changes' : 'Saved to shared records'}</span><button className={button} disabled={busy} onClick={() => void perform(async () => { await save(); })}>{busy ? 'Working…' : 'Save declaration & signatures'}</button></div>
    </div>
    {signing && <SignatureModal title={SIG_META.find(m => m.key === signing)!.label} defaultName={doc.sigs[signing].name} onClose={() => setSigning(null)} onSave={sign} />}
  </div>;
}
