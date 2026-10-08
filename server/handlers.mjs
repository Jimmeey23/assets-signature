/**
 * Physique 57 – Asset Declaration mail server.
 *
 *  • POST /api/submit  → receives the signed PDF + form data, appends a row to the running
 *                        submissions ledger, rebuilds the running Excel sheet and emails BOTH
 *                        attachments through the Mailtrap **Email Sending HTTP API**
 *                        (https://send.api.mailtrap.io/api/send, authenticated with an
 *                        Authorization: Bearer header).
 *  • GET  /api/health  → configuration / connectivity check.
 *  • GET  /*           → serves the built app from ./dist so everything runs from one port.
 *
 * Configure via server/.env (see server/.env.example):
 *   MAILTRAP_API_TOKEN   – the API token from Mailtrap (Settings → API Tokens).
 *   MAILTRAP_FROM        – address on a domain you have VERIFIED in Mailtrap.
 *   Recipient is fixed to jimmeey@physique57india.com.
 *   API endpoint is fixed to https://send.api.mailtrap.io/api/send.
 *
 * Run:  npm run build && node server/server.mjs
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const XLSX = await import("xlsx");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ───────── Config (.env) ───────── */
const envFile = path.join(__dirname, ".env");
if (process.env.VERCEL !== "1" && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

export const cfg = {
  port: Number(process.env.PORT || 3001),
  apiToken: process.env.MAILTRAP_API_TOKEN || "",
  from: process.env.MAILTRAP_FROM || "",
  fromName: process.env.MAILTRAP_FROM_NAME || "Physique 57 Asset Declarations",
  to: "jimmeey@physique57india.com",
  host: "send.api.mailtrap.io",
  path: "/api/send",
  origin: process.env.ALLOWED_ORIGIN || "*",
  dataDir: path.resolve(__dirname, process.env.DATA_DIR || "data"),
  staticDir: path.resolve(__dirname, "..", "dist"),
  tz: process.env.DISPLAY_TZ || "Asia/Kolkata",
};
export const apiConfigured = Boolean(cfg.apiToken && cfg.from);

const serverless = process.env.VERCEL === "1";
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const ledgerMode = redisUrl && redisToken ? "shared" : serverless ? "submission" : "local";
const ledgerFile = path.join(cfg.dataDir, "submissions.json");
const redisKey = "p57:asset-declaration:submissions";
if (ledgerMode === "local") fs.mkdirSync(cfg.dataDir, { recursive: true });

async function redisCommand(command) {
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error("The shared submissions ledger is unavailable. Please retry.");
  return body.result;
}

export const readLedger = async () => {
  if (ledgerMode === "submission") return [];
  if (ledgerMode === "shared") {
    const values = await redisCommand(["HVALS", redisKey]);
    return values.map((value) => JSON.parse(value)).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }
  try {
    return JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw new Error("The submissions ledger could not be read.");
  }
};
const writeLedger = async (rows, record) => {
  if (ledgerMode === "submission") return;
  if (ledgerMode === "shared") {
    await redisCommand(["HSET", redisKey, record.ref, JSON.stringify(record)]);
    return;
  }
  const tmp = `${ledgerFile}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
  fs.renameSync(tmp, ledgerFile);
};

const fmt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return String(iso);
  return d.toLocaleString("en-GB", {
    timeZone: cfg.tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const sigOf = (r, key) => (r.signatures || []).find((s) => s.key === key);
const statusOf = (r) => {
  const pending = (r.signatures || []).filter((s) => !s.signed).map((s) => s.label);
  return pending.length ? `Pending: ${pending.join(", ")}` : "Complete";
};

function buildSheet(records) {
  const head = [
    "Sr. No.",
    "Submission Ref",
    "Submitted On",
    "Employee Name",
    "Employee ID",
    "Designation",
    "Department",
    "Date & Time of Issue",
    "No. of Assets",
    "Assets Issued",
    "Employee Signed",
    "Employee Signed On",
    "Handed Over By",
    "Handover Signed",
    "Admin / Ops Verified By",
    "Verification Signed",
    "Status",
  ];
  const body = records.map((r, i) => {
    const e = sigOf(r, "employee");
    const h = sigOf(r, "handover");
    const a = sigOf(r, "admin");
    return [
      i + 1,
      r.ref,
      fmt(r.submittedAt),
      r.employeeName,
      r.employeeId,
      r.designation,
      r.department,
      fmt(r.issueDate),
      r.assets.length,
      r.assets.map((x) => `${x.name}${x.serial ? ` (${x.serial})` : ""}`).join("; "),
      e?.signed ? "Yes" : "No",
      fmt(e?.signedAt),
      h?.name || "",
      h?.signed ? "Yes" : "No",
      a?.name || "",
      a?.signed ? "Yes" : "No",
      statusOf(r),
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  ws["!cols"] = [8, 24, 20, 24, 14, 20, 18, 20, 10, 56, 14, 20, 22, 14, 24, 16, 28].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: `A1:Q${Math.max(body.length + 1, 2)}` };

  const regHead = ["Submission Ref", "Employee Name", "Employee ID", "Department", "Asset", "Asset / Serial No.", "Condition at Issue", "Remarks", "Issued On"];
  const regBody = records.flatMap((r) =>
    r.assets.map((x) => [r.ref, r.employeeName, r.employeeId, r.department, x.name, x.serial, x.condition, x.remarks, fmt(r.issueDate)]),
  );
  const ws2 = XLSX.utils.aoa_to_sheet([regHead, ...regBody]);
  ws2["!cols"] = [24, 24, 14, 18, 24, 22, 20, 30, 20].map((wch) => ({ wch }));
  ws2["!autofilter"] = { ref: `A1:I${Math.max(regBody.length + 1, 2)}` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Submissions");
  XLSX.utils.book_append_sheet(wb, ws2, "Asset Register");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const str = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function sanitize(input) {
  const r = input || {};
  return {
    ref: str(r.ref, 60),
    submittedAt: new Date().toISOString(),
    employeeName: str(r.employeeName),
    employeeId: str(r.employeeId),
    designation: str(r.designation),
    department: str(r.department),
    issueDate: str(r.issueDate, 40),
    declName: str(r.declName),
    assets: (Array.isArray(r.assets) ? r.assets : []).slice(0, 100).map((a) => ({
      name: str(a?.name),
      serial: str(a?.serial),
      condition: str(a?.condition),
      remarks: str(a?.remarks, 500),
    })),
    signatures: (Array.isArray(r.signatures) ? r.signatures : []).slice(0, 3).map((s) => ({
      key: str(s?.key, 20),
      label: str(s?.label, 80),
      name: str(s?.name),
      date: str(s?.date, 40),
      signed: Boolean(s?.signed),
      signedAt: s?.signedAt ? str(String(s.signedAt), 40) : null,
      method: s?.method === "draw" || s?.method === "type" ? s.method : null,
    })),
  };
}

const hits = new Map();
export const rateLimited = (ip) => {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 30;
};

let queue = Promise.resolve();
const serialize = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

export const sendJson = (res, status, body, extra = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": cfg.origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  });
  res.end(JSON.stringify(body));
};

const readBody = (req, limit = 15 * 1024 * 1024) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

/** Call the Mailtrap REST API. Returns { statusCode, body }. */
function mailtrapSend(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        host: cfg.host,
        path: cfg.path,
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { raw };
          }
          resolve({ statusCode: res.statusCode || 500, body: parsed });
        });
      },
    );
    req.setTimeout(30_000, () => req.destroy(new Error("Mailtrap request timed out. Please retry.")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function handleSubmit(req, res) {
  if (!apiConfigured) {
    return sendJson(res, 503, {
      ok: false,
      error:
        "Mailtrap API credentials are missing on the server. Set MAILTRAP_API_TOKEN and MAILTRAP_FROM in Vercel Project Settings → Environment Variables, then redeploy (or use server/.env locally).",
    });
  }

  let payload;
  try {
    payload = req.body !== undefined
      ? (typeof req.body === "string" ? JSON.parse(req.body) : req.body)
      : JSON.parse(await readBody(req));
    if (!payload || typeof payload !== "object") throw new Error("Invalid request body");
  } catch (e) {
    return sendJson(res, e.status || 400, {
      ok: false,
      error: e.status === 413 ? "The submission is too large." : "Invalid request body.",
    });
  }

  const record = sanitize(payload.record);
  const pdfB64 = typeof payload.pdf?.base64 === "string" ? payload.pdf.base64 : "";
  const pdfName = str(payload.pdf?.filename, 120).replace(/[^\w.\- ]+/g, "_") || `Asset-Declaration_${record.ref}.pdf`;

  const missing = [];
  if (!record.ref) missing.push("reference");
  if (!record.employeeName) missing.push("employee name");
  if (!record.employeeId) missing.push("employee ID");
  if (!record.assets.length) missing.push("assets");
  if (!sigOf(record, "employee")?.signed) missing.push("employee signature");
  if (missing.length) return sendJson(res, 422, { ok: false, error: `Missing required information: ${missing.join(", ")}.` });
  if (!pdfB64.startsWith("JVBER")) return sendJson(res, 422, { ok: false, error: "The signed PDF was missing or invalid." });

  try {
    const result = await serialize(async () => {
      const ledger = await readLedger();
      const idx = ledger.findIndex((r) => r.ref === record.ref);
      const next = [...ledger];
      if (idx >= 0) next[idx] = record;
      else next.push(record);

      const sheet = buildSheet(next);
      const rowNumber = (idx >= 0 ? idx : next.length - 1) + 1;
      const isRunningSheet = ledgerMode !== "submission";
      const sheetName = isRunningSheet ? "Physique57_Asset_Declarations_Running_Sheet.xlsx" : `Physique57_Asset_Declaration_${record.ref.replace(/[^a-z0-9_-]/gi, "_")}.xlsx`;
      const sheetDescription = isRunningSheet ? "running submissions sheet" : "submission details sheet";
      const assetList = record.assets.map((a) => `${a.name}${a.serial ? ` – ${a.serial}` : ""}`).join(", ");

      const subject = `Asset Declaration – ${record.employeeName} (${record.employeeId}) · ${record.ref}`;
      const text = [
        "A new Company Asset Declaration / Undertaking has been submitted.",
        "",
        `Employee:    ${record.employeeName} (${record.employeeId})`,
        `Designation: ${record.designation || "-"}`,
        `Department:  ${record.department || "-"}`,
        `Assets:      ${assetList}`,
        `Status:      ${statusOf(record)}`,
        `Reference:   ${record.ref}`,
        `Submitted:   ${fmt(record.submittedAt)}`,
        "",
        `Attached: signed PDF and the ${sheetDescription} (${next.length} submission${
          next.length === 1 ? "" : "s"
        } to date).`,
      ].join("\n");

      const row = (k, v) =>
        `<tr><td style="padding:7px 18px 7px 0;color:#8a8a8a;font-size:11px;text-transform:uppercase;letter-spacing:.12em;white-space:nowrap">${k}</td><td style="padding:7px 0;color:#111;font-size:14px;border-bottom:1px solid #eee">${v}</td></tr>`;
      const html = `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;max-width:560px">
<tr><td style="height:3px;background:#f26a21"></td></tr>
<tr><td style="padding:30px 36px 8px">
<div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8a8a8a">AMP Fitness · Asset Declaration</div>
<h1 style="margin:10px 0 4px;font:700 22px Helvetica,Arial,sans-serif;color:#0b1b3a">New submission received</h1>
<div style="font-size:13px;color:#666;line-height:1.6">The signed declaration and the ${sheetDescription} are attached.</div>
</td></tr>
<tr><td style="padding:14px 36px 28px"><table width="100%" cellpadding="0" cellspacing="0">
${row("Employee", esc(record.employeeName))}
${row("Employee ID", esc(record.employeeId))}
${row("Designation", esc(record.designation || "-"))}
${row("Department", esc(record.department || "-"))}
${row("Assets", esc(assetList))}
${row("Status", esc(statusOf(record)))}
${row("Reference", esc(record.ref))}
${row("Submitted", esc(fmt(record.submittedAt)))}
</table></td></tr>
<tr><td style="padding:0 36px 28px;font-size:12px;color:#8a8a8a;line-height:1.6;border-top:1px solid #eee"><div style="padding-top:16px">${isRunningSheet ? "Running sheet now contains" : "This sheet contains"} <b style="color:#111">${next.length}</b> submission${next.length === 1 ? "" : "s"}. Sent via Mailtrap Email Sending API.</div></td></tr>
</table></td></tr></table></body></html>`;

      const payload = {
        from: { email: cfg.from, name: cfg.fromName },
        to: [{ email: cfg.to }],
        subject,
        text,
        html,
        category: "asset-declaration",
        attachments: [
          {
            filename: pdfName,
            type: "application/pdf",
            disposition: "attachment",
            content: pdfB64,
          },
          {
            filename: sheetName,
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            disposition: "attachment",
            content: sheet.toString("base64"),
          },
        ],
      };

      const mt = await mailtrapSend(payload);
      if (mt.statusCode < 200 || mt.statusCode >= 300 || mt.body?.success !== true) {
        const errs = Array.isArray(mt.body?.errors) ? mt.body.errors.join("; ") : mt.body?.message || mt.body?.error || `HTTP ${mt.statusCode}`;
        const hint = /verified|domain|sender|from/i.test(errs)
          ? " Make sure MAILTRAP_FROM uses an address on a domain you have verified in Mailtrap under Email Sending."
          : /token|auth|unauthorized|forbidden/i.test(errs)
            ? " Check that MAILTRAP_API_TOKEN is a valid Email Sending API token (not the Testing sandbox password)."
            : "";
        throw new Error(`Mailtrap rejected the message (${mt.statusCode}): ${errs}${hint}`);
      }

      await writeLedger(next, record); // only commit once Mailtrap has accepted the email
      return { ok: true, ref: record.ref, sentTo: cfg.to, rowNumber, totalSubmissions: next.length, ledgerMode };
    });
    console.log(`[${new Date().toISOString()}] sent ${record.ref} (${record.employeeName}) → ${cfg.to}`);
    return sendJson(res, 200, result);
  } catch (e) {
    console.error("Mail error:", e);
    return sendJson(res, 502, { ok: false, error: e.message || "Mailtrap rejected the message." });
  }
}


export async function handleHealth(req, res) {
  const records = await readLedger();
  return sendJson(res, 200, {
    ok: true,
    apiConfigured,
    recipient: cfg.to,
    from: cfg.from || null,
    submissions: ledgerMode === "submission" ? null : records.length,
    ledgerMode,
  });
}
