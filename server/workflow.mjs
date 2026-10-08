import crypto from 'node:crypto';
import { jsPDF } from 'jspdf';
import fs from 'node:fs';
import { cfg, apiConfigured, ledgerMode, redisCommand, readLedger, writeLedger, buildSheet, sanitize, mailtrapSend, sendJson } from './handlers.mjs';
import { buildPdf } from '../shared/pdf-engine.js';
import { SIG_META } from '../shared/document-meta.js';

const DOCS = 'p57:asset-declaration:documents';
const PRESETS = 'p57:asset-declaration:signature-presets';
const APP_URL = process.env.APP_URL || 'https://assets-signature.vercel.app';
const logo = `data:image/png;base64,${fs.readFileSync(new URL('../src/assets/physique57-logo.png', import.meta.url)).toString('base64')}`;
const directory = JSON.parse(fs.readFileSync(new URL('../src/data/employees.json', import.meta.url), 'utf8'));
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const now = () => new Date().toISOString();
const error = (status, message) => Object.assign(new Error(message), { status });
const text = (v, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const email = (v) => {
  const result = text(v, 254).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result)) throw error(422, 'Enter a valid recipient email address.');
  return result;
};
const equal = (a, b) => {
  const first = Buffer.from(hash(a)); const second = Buffer.from(hash(b));
  return crypto.timingSafeEqual(first, second);
};
const requireStorage = () => {
  if (ledgerMode !== 'shared') throw error(503, 'Connect Redis and redeploy to enable the admin center and shared documents.');
};
export async function bodyOf(req) {
  if (req.body !== undefined) {
    try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { throw error(400, 'Invalid request body.'); }
  }
  let raw = ''; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4_000_000) throw error(413, 'The document is too large.');
    raw += chunk;
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw error(400, 'Invalid request body.'); }
}
const readDoc = async (id) => {
  const value = await redisCommand(['HGET', DOCS, text(id, 80)]);
  if (!value) throw error(404, 'Document not found.');
  return JSON.parse(value);
};
const saveDoc = async (doc) => redisCommand(['HSET', DOCS, doc.id, JSON.stringify(doc)]);
async function locked(id, work) {
  const key = `p57:asset-declaration:lock:${id}`;
  const value = crypto.randomBytes(16).toString('hex');
  if (await redisCommand(['SET', key, value, 'NX', 'EX', 330]) !== 'OK') throw error(409, 'This document is being updated. Please refresh and retry.');
  try { return await work(); }
  finally {
    await redisCommand(['EVAL', 'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end', 1, key, value]);
  }
}
function signature(input) {
  if (!input?.sig) return { sig: null, name: text(input?.name), date: text(input?.date, 10), signedAt: null };
  const sig = input.sig;
  if (!['draw', 'type'].includes(sig.method) || typeof sig.image !== 'string' || sig.image.length > 350_000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig.image)) throw error(422, 'A signature must be a valid PNG image.');
  try { const image = new jsPDF().getImageProperties(sig.image); if (image.width > 4000 || image.height > 2000) throw new Error(); } catch { throw error(422, 'The signature image could not be read. Please sign again.'); }
  return { sig: { method: sig.method, image: sig.image, ...(sig.text ? { text: text(sig.text) } : {}) }, name: text(input.name || sig.text), date: text(input.date, 10) || now().slice(0, 10), signedAt: now() };
}
export function normalizeDocument(input) {
  if (!input?.fields || !Array.isArray(input.assets) || !input.sigs) throw error(422, 'The full declaration is required. Refresh the app and try again.');
  const fields = Object.fromEntries(['refNo', 'employeeName', 'employeeId', 'designation', 'department', 'issueDate', 'declName'].map(k => [k, text(input.fields[k])]));
  const doc = {
    fields,
    introRest: text(input.introRest, 5000), objective: text(input.objective, 5000), scope: text(input.scope, 8000),
    declaration1: text(input.declaration1, 8000), declaration2: text(input.declaration2, 8000),
    terms: (Array.isArray(input.terms) ? input.terms : []).slice(0, 50).map((t, i) => ({ id: i + 1, text: text(t.text, 5000) })),
    assets: input.assets.slice(0, 100).filter(a => text(a.name)).map((a, i) => ({ id: i + 1, name: text(a.name), serial: text(a.serial), condition: text(a.condition), remarks: text(a.remarks, 1000) })),
    sigs: Object.fromEntries(SIG_META.map(m => [m.key, signature(input.sigs[m.key])])),
  };
  if (JSON.stringify(doc).length > 1_500_000) throw error(413, 'The document is too large. Reduce signature image sizes.');
  if (!doc.assets.length || !doc.terms.length || !doc.declaration1 || !doc.objective || !doc.scope) throw error(422, 'Include the assets, terms, objective, scope and undertaking before saving.');
  return doc;
}
function recordOf(doc) {
  return sanitize({ ref: doc.fields.refNo, ...doc.fields, assets: doc.assets, signatures: SIG_META.map(m => ({ ...m, name: doc.sigs[m.key].name, date: doc.sigs[m.key].date, signed: Boolean(doc.sigs[m.key].sig), signedAt: doc.sigs[m.key].signedAt, method: doc.sigs[m.key].sig?.method ?? null })) });
}
const contentOf = (doc) => JSON.stringify({ ...doc, sigs: undefined });
const statusOf = (item) => {
  if (item.document?.sigs.employee.sig) return item.document.sigs.handover.sig && item.document.sigs.admin.sig ? 'Complete' : 'Awaiting admin signatures';
  if (item.openedAt) return 'Opened · awaiting signature';
  if (item.invitedAt) return 'Awaiting employee signature';
  return 'Draft';
};
function summary(item) {
  return {
    id: item.id, ref: item.document.fields.refNo, employeeName: item.document.fields.employeeName,
    employeeId: item.document.fields.employeeId, designation: item.document.fields.designation,
    department: item.document.fields.department, recipientEmail: item.recipientEmail || '',
    createdAt: item.createdAt, updatedAt: item.updatedAt, submittedAt: item.submittedAt || null,
    invitedAt: item.invitedAt || null, openedAt: item.openedAt || null,
    status: statusOf(item), revision: item.revision,
    signatures: Object.fromEntries(SIG_META.map(m => [m.key, Boolean(item.document.sigs[m.key].sig)])),
    emails: item.emails || [], legacy: false,
  };
}
const publicDoc = (item) => ({ ...summary(item), document: item.document, events: item.events || [] });
function appendEvent(item, type, detail) {
  item.events = [...(item.events || []), { type, detail, at: now() }].slice(-100);
  item.updatedAt = now();
}
async function commitSubmission(item) {
  const record = recordOf(item.document); record.submittedAt = item.submittedAt;
  const records = await readLedger();
  const next = records.filter(r => r.ref !== record.ref); next.push(record);
  await writeLedger(next, record);
  return { record, records: next };
}
async function sendMail(payload) {
  if (!apiConfigured) throw error(503, 'Mailtrap is not configured. Add its API token and verified sender, then redeploy.');
  const result = await mailtrapSend({ from: { email: cfg.from, name: cfg.fromName }, category: 'asset-declaration', ...payload });
  if (result.statusCode < 200 || result.statusCode >= 300 || result.body?.success !== true) {
    const detail = result.body?.message || result.body?.error || (result.body?.errors || []).join('; ') || `HTTP ${result.statusCode}`;
    throw error(502, `Mailtrap did not accept the email: ${detail}`);
  }
  return result.body?.message_ids || [];
}
const attachment = (pdf) => ({ filename: pdf.filename, type: 'application/pdf', disposition: 'attachment', content: pdf.base64 });
async function mailDocument(item, recipients, kind, link, force = false) {
  const pdf = await buildPdf(item.document, item.document.fields.refNo, logo);
  const records = kind === 'completion' ? (await commitSubmission(item)).records : null;
  let failures = 0;
  for (const address of recipients) {
    const key = `${kind}:${address}:${item.revision}`;
    if (!force && item.emails?.some(m => m.key === key && m.status === 'Accepted')) continue;
    const mail = { key, to: address, kind, status: 'Sending', at: now(), error: null };
    item.emails = [...(item.emails || []).filter(m => m.key !== key), mail];
    await saveDoc(item);
    try {
      const invite = kind === 'invitation';
      const attachments = [attachment(pdf)];
      if (records) attachments.push({ filename: 'Physique57_Asset_Declarations_Running_Sheet.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'attachment', content: buildSheet(records).toString('base64') });
      mail.messageIds = await sendMail({
        to: [{ email: address }],
        subject: `${invite ? 'Please sign your' : 'Signed'} asset declaration · ${item.document.fields.employeeName} · ${item.document.fields.refNo}`,
        text: invite
          ? `Hello ${item.document.fields.employeeName},\n\nYour company asset declaration has been signed by the handover and verification team. The presigned PDF is attached. Review the declaration and add your employee signature using your private link:\n\n${link}\n\nThis link expires on ${new Date(item.invitationExpiresAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' })}.\n\nPhysique 57 India`
          : `The signed company asset declaration for ${item.document.fields.employeeName} is attached, along with the shared submissions sheet.\n\nReference: ${item.document.fields.refNo}\nStatus: ${statusOf(item)}\n\nPhysique 57 India`,
        attachments,
      });
      mail.status = 'Accepted';
      if (invite) item.invitedAt = now();
      appendEvent(item, 'Email accepted', `${kind} email to ${address}`);
    } catch (e) {
      failures++; mail.status = 'Failed'; mail.error = e.message;
      appendEvent(item, 'Email failed', `${address}: ${e.message}`);
    }
    await saveDoc(item);
  }
  return { item: publicDoc(item), failed: failures };
}
async function requireAdmin(req) {
  const cookies = Object.fromEntries((req.headers?.cookie || '').split(';').filter(x => x.includes('=')).map(x => { const [k, ...v] = x.trim().split('='); return [k, v.join('=')]; }));
  const token = cookies.p57_admin;
  if (!token || !await redisCommand(['GET', `p57:admin:session:${hash(token)}`])) throw error(401, 'Enter the admin access code to continue.');
}
const cookie = (token, maxAge) => `p57_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.VERCEL === '1' ? '; Secure' : ''}`;
function checkOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return;
  const allowed = [new URL(APP_URL).origin];
  if (req.headers?.host) allowed.push(`https://${req.headers.host}`, `http://${req.headers.host}`);
  if (!allowed.includes(origin)) throw error(403, 'Requests must come from this app.');
}
function query(req) { return new URL(req.url || '/', 'http://localhost').searchParams; }
async function login(req, res, body) {
  const code = process.env.ADMIN_CODE?.trim();
  if (!code) throw error(503, 'Admin access has not been configured on the server.');
  const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const key = `p57:admin:attempts:${hash(ip)}`;
  const attempts = await redisCommand(['INCR', key]);
  if (attempts === 1) await redisCommand(['EXPIRE', key, 900]);
  if (attempts > 5) throw error(429, 'Too many code attempts. Try again in 15 minutes.');
  if (!equal(text(body?.code, 100), code)) throw error(401, 'Incorrect access code.');
  await redisCommand(['DEL', key]);
  const token = crypto.randomBytes(32).toString('hex');
  await redisCommand(['SET', `p57:admin:session:${hash(token)}`, 'admin', 'EX', 28800]);
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie(token, 28800), 'Access-Control-Allow-Origin': new URL(APP_URL).origin });
}
async function listDocuments() {
  const items = (await redisCommand(['HVALS', DOCS])).map(v => JSON.parse(v));
  const refs = new Set(items.map(i => i.document.fields.refNo));
  const legacy = (await readLedger()).filter(r => !refs.has(r.ref)).map(r => ({
    id: `legacy:${r.ref}`, ref: r.ref, employeeName: r.employeeName, employeeId: r.employeeId, designation: r.designation, department: r.department,
    recipientEmail: '', createdAt: r.submittedAt, updatedAt: r.submittedAt, submittedAt: r.submittedAt,
    status: r.signatures.every(s => s.signed) ? 'Complete' : 'Awaiting admin signatures',
    signatures: Object.fromEntries(SIG_META.map(m => [m.key, Boolean(r.signatures.find(s => s.key === m.key)?.signed)])),
    emails: [], legacy: true,
  }));
  return [...items.map(summary), ...legacy].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function saveAdminDocument(body) {
  const id = body.id || crypto.randomUUID();
  return locked(id, async () => {
    let item = body.id ? await readDoc(body.id) : null;
    if (item && body.revision !== item.revision) throw error(409, 'The document changed since you opened it. Reload before saving.');
    const doc = normalizeDocument(body.document);
    if (item) {
      // Once issued or submitted, only the two admin signatures can change.
      if ((item.invitedAt || item.submittedAt) && contentOf(doc) !== contentOf(item.document)) throw error(409, 'An issued document cannot be edited. Create a new declaration for revised terms or assets.');
      doc.sigs.employee = item.document.sigs.employee;
      doc.fields.refNo = item.document.fields.refNo;
      for (const key of ['handover', 'admin']) if (JSON.stringify(doc.sigs[key].sig) === JSON.stringify(item.document.sigs[key].sig) && doc.sigs[key].name === item.document.sigs[key].name && doc.sigs[key].date === item.document.sigs[key].date) doc.sigs[key] = item.document.sigs[key];
    } else {
      doc.sigs.employee = signature(null);
      doc.fields.refNo = `AMP/AST/${new Date().getFullYear()}/${id.slice(0, 8).toUpperCase()}`;
    }
    item = { ...item, id, document: doc, recipientEmail: body.recipientEmail ? email(body.recipientEmail) : item?.recipientEmail || '', createdAt: item?.createdAt || now(), updatedAt: now(), revision: (item?.revision || 0) + 1, emails: item?.emails || [], events: item?.events || [] };
    appendEvent(item, 'Admin saved', 'Declaration and admin signatures saved');
    await saveDoc(item);
    if (item.submittedAt) await commitSubmission(item);
    return publicDoc(item);
  });
}
// Saved handover and admin signatures that prefill every new declaration and bulk template.
async function readPresets() {
  const value = await redisCommand(['GET', PRESETS]);
  const stored = value ? JSON.parse(value) : {};
  return { handover: stored.handover || null, admin: stored.admin || null };
}
async function savePresets(input) {
  if (!input || typeof input !== 'object') throw error(422, 'Signature presets are required.');
  const presets = {};
  for (const key of ['handover', 'admin']) {
    const value = input[key];
    if (!value) { presets[key] = null; continue; }
    const name = text(value.name);
    if (!name) throw error(422, 'Each signature preset needs the signatory’s printed name.');
    presets[key] = { name, sig: value.sig ? signature({ sig: value.sig, name }).sig : null, updatedAt: now() };
  }
  await redisCommand(['SET', PRESETS, JSON.stringify(presets)]);
  return presets;
}
async function inviteOne(template, recipient, batchId) {
  const employee = directory.find(e => e.id === recipient.employeeId);
  if (!employee) throw error(422, 'Choose an employee from the directory.');
  if (!employee.designation || !employee.department) throw error(422, `${employee.name} is missing a designation or department in the directory.`);
  const address = email(recipient.email || employee.email);
  const id = hash(`${template.id}:${batchId}:${employee.id}`).slice(0, 32);
  return locked(id, async () => {
    let item;
    try { item = await readDoc(id); } catch (e) { if (e.status !== 404) throw e; }
    if (item?.invitedAt || item?.submittedAt) return { item: publicDoc(item), failed: 0 };
    if (!item) {
      const doc = structuredClone(template.document);
      doc.fields = { ...doc.fields, employeeName: employee.name, declName: employee.name, employeeId: employee.id, designation: employee.designation, department: employee.department, refNo: `AMP/AST/${new Date().getFullYear()}/${id.slice(0, 10).toUpperCase()}` };
      doc.sigs.employee = signature(null);
      item = { id, document: doc, recipientEmail: address, createdAt: now(), updatedAt: now(), revision: 1, emails: [], events: [] };
    }
    const token = crypto.randomBytes(32).toString('hex');
    item.invitationHash = hash(token); item.invitationExpiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    appendEvent(item, 'Invitation prepared', `Assigned to ${employee.name}`);
    await saveDoc(item);
    return mailDocument(item, [address], 'invitation', `${APP_URL}/#/sign/${id}.${token}`);
  });
}
export async function handleAdmin(req, res) {
  try {
    requireStorage();
    const params = query(req); const action = params.get('action') || 'session';
    if (req.method === 'POST') checkOrigin(req);
    const body = req.method === 'POST' ? await bodyOf(req) : {};
    if (action === 'login' && req.method === 'POST') return await login(req, res, body);
    await requireAdmin(req);
    if (action === 'session' && req.method === 'GET') return sendJson(res, 200, { ok: true });
    if (action === 'logout' && req.method === 'POST') {
      const token = (req.headers.cookie || '').match(/(?:^|;\s*)p57_admin=([^;]+)/)?.[1];
      if (token) await redisCommand(['DEL', `p57:admin:session:${hash(token)}`]);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
    }
    if (action === 'list' && req.method === 'GET') return sendJson(res, 200, { ok: true, documents: await listDocuments(), updatedAt: now() });
    if (action === 'document' && req.method === 'GET') return sendJson(res, 200, { ok: true, item: publicDoc(await readDoc(params.get('id'))) });
    if (action === 'pdf' && req.method === 'GET') {
      const item = await readDoc(params.get('id')); const pdf = await buildPdf(item.document, item.document.fields.refNo, logo);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `${params.get('inline') === '1' ? 'inline' : 'attachment'}; filename="${pdf.filename}"` });
      return res.end(Buffer.from(pdf.base64, 'base64'));
    }
    if (action === 'sheet' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="Physique57_Asset_Declarations_Running_Sheet.xlsx"' });
      return res.end(buildSheet(await readLedger()));
    }
    if (action === 'presets' && req.method === 'GET') return sendJson(res, 200, { ok: true, presets: await readPresets() });
    if (action === 'presets' && req.method === 'POST') return sendJson(res, 200, { ok: true, presets: await savePresets(body.presets) });
    if (action === 'save' && req.method === 'POST') return sendJson(res, 200, { ok: true, item: await saveAdminDocument(body) });
    if (action === 'invite' && req.method === 'POST') {
      const template = await readDoc(body.id);
      if (template.revision !== body.revision) throw error(409, 'Save or reload the template before sending.');
      if (!template.document.sigs.handover.sig || !template.document.sigs.admin.sig || !template.document.sigs.handover.name || !template.document.sigs.admin.name) throw error(422, 'Sign Handed Over By and Admin / Operations Verification before sending invitations.');
      if (!Array.isArray(body.recipients) || body.recipients.length < 1 || body.recipients.length > 5 || !text(body.batchId)) throw error(422, 'Choose between one and five recipients per request.');
      const results = [];
      for (const recipient of body.recipients) {
        try { results.push(await inviteOne(template, recipient, body.batchId)); }
        catch (e) { results.push({ failed: 1, error: e.message, employeeId: recipient.employeeId }); }
      }
      return sendJson(res, 200, { ok: true, results });
    }
    if (action === 'reinvite' && req.method === 'POST') {
      const result = await locked(body.id, async () => {
        const item = await readDoc(body.id);
        if (item.submittedAt) throw error(409, 'The employee has already submitted this document.');
        if (item.revision !== body.revision) throw error(409, 'Reload the latest document before resending.');
        if (!item.document.sigs.handover.sig || !item.document.sigs.admin.sig) throw error(422, 'Both admin signatures are required.');
        const token = crypto.randomBytes(32).toString('hex');
        item.invitationHash = hash(token); item.invitationExpiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
        item.openedAt = null;
        await saveDoc(item);
        return mailDocument(item, [email(body.recipientEmail || item.recipientEmail)], 'invitation', `${APP_URL}/#/sign/${item.id}.${token}`, true);
      });
      return sendJson(res, 200, { ok: true, ...result });
    }
    if (action === 'email' && req.method === 'POST') {
      const addresses = [...new Set((Array.isArray(body.recipients) ? body.recipients : []).map(email))];
      if (!addresses.length || addresses.length > 10) throw error(422, 'Enter one to ten recipient email addresses.');
      const result = await locked(body.id, async () => {
        const item = await readDoc(body.id);
        if (item.revision !== body.revision) throw error(409, 'Reload the latest signatures before emailing.');
        if (!SIG_META.every(m => item.document.sigs[m.key].sig)) throw error(422, 'All three signatures are required to send the completed declaration. Use an invitation for a presigned document.');
        return mailDocument(item, addresses, 'completion', null, Boolean(body.force));
      });
      return sendJson(res, 200, { ok: true, ...result });
    }
    throw error(405, 'This action does not support that request method.');
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('Admin request failed', e.message);
    return sendJson(res, e.status || 503, { ok: false, error: e.message || 'The admin service is unavailable.' });
  }
}
async function invitation(token) {
  const [id, secret] = String(token || '').split('.');
  if (!id || !secret) throw error(404, 'This signing link is invalid.');
  const item = await readDoc(id);
  if (!item.invitationHash || !equal(hash(secret), item.invitationHash)) throw error(404, 'This signing link is invalid.');
  if (Date.parse(item.invitationExpiresAt) < Date.now()) throw error(410, 'This signing link has expired. Contact the admin team for a new invitation.');
  return item;
}
export async function handleInvitation(req, res) {
  try {
    requireStorage();
    if (req.method !== 'GET') throw error(405, 'Use GET to open the declaration.');
    let item = await invitation(query(req).get('token'));
    item = await locked(item.id, async () => {
      const latest = await invitation(query(req).get('token'));
      if (!latest.openedAt) { latest.openedAt = now(); appendEvent(latest, 'Opened', 'Recipient opened the signing link'); await saveDoc(latest); }
      return latest;
    });
    return sendJson(res, 200, { ok: true, item: publicDoc(item) });
  } catch (e) { return sendJson(res, e.status || 503, { ok: false, error: e.message }); }
}
export async function handleWorkflowSubmit(req, res) {
  try {
    requireStorage(); checkOrigin(req);
    const body = await bodyOf(req);
    const supplied = normalizeDocument(body.document);
    if (!supplied.sigs.employee.sig) throw error(422, 'Add your employee signature before submitting.');
    let result;
    if (body.invitationToken) {
      const original = await invitation(body.invitationToken);
      result = await locked(original.id, async () => {
        const item = await invitation(body.invitationToken);
        if (item.submittedAt) return { item: publicDoc(item), failed: 0, alreadySubmitted: true };
        if (contentOf(supplied) !== contentOf(item.document)) throw error(409, 'The assigned document cannot be changed. Refresh your signing link.');
        item.document.sigs.employee = { ...supplied.sigs.employee, name: item.document.fields.employeeName, signedAt: now() };
        item.submittedAt = now(); item.revision++;
        appendEvent(item, 'Submitted', 'Employee signed and submitted their assigned declaration');
        await saveDoc(item); await commitSubmission(item);
        return mailDocument(item, [...new Set([cfg.to, item.recipientEmail].filter(Boolean))], 'completion');
      });
    } else {
      if (supplied.sigs.handover.sig || supplied.sigs.admin.sig) throw error(403, 'Admin signatures can only be added through the protected admin center.');
      if (!supplied.fields.employeeName || !supplied.fields.employeeId || !supplied.fields.designation || !supplied.fields.department || !supplied.fields.refNo) throw error(422, 'Complete the employee details before submitting.');
      const id = hash(`standalone:${supplied.fields.refNo}`).slice(0, 32);
      result = await locked(id, async () => {
        let item;
        try { item = await readDoc(id); } catch (e) { if (e.status !== 404) throw e; }
        if (item) {
          if (contentOf(supplied) !== contentOf(item.document)) throw error(409, 'This reference has already been submitted with different details. Start a new declaration.');
          if (item.emails.some(m => m.status === 'Accepted')) return { item: publicDoc(item), failed: 0, alreadySubmitted: true };
        } else {
          const stamped = now();
          item = { id, document: supplied, createdAt: stamped, updatedAt: stamped, submittedAt: stamped, revision: 1, emails: [], events: [] };
          item.document.sigs.employee.signedAt = stamped;
          appendEvent(item, 'Submitted', 'Employee signed and submitted their declaration');
          await saveDoc(item); await commitSubmission(item);
        }
        return mailDocument(item, [cfg.to], 'completion');
      });
    }
    const records = await readLedger();
    return sendJson(res, 200, { ok: true, ref: result.item.ref, sentTo: cfg.to, rowNumber: Math.max(1, records.findIndex(r => r.ref === result.item.ref) + 1), totalSubmissions: records.length, ledgerMode: 'shared', notificationStatus: result.failed ? 'Failed' : 'Accepted', alreadySubmitted: Boolean(result.alreadySubmitted) });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('Submission failed', e.message);
    return sendJson(res, e.status || 503, { ok: false, error: e.message || 'The submission service is unavailable.' });
  }
}
