import employees from "../data/employees.json";

/** A signature is always stored as a transparent PNG so screen, print and PDF look identical. */
export interface Sig {
  method: "draw" | "type";
  image: string; // data URL (png)
  text?: string; // typed text, when method === "type"
}

export type SigKey = "employee" | "handover" | "admin";

export interface SigBlock {
  sig: Sig | null;
  name: string;
  date: string;
  signedAt: string | null;
}

export interface Fields {
  refNo: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  department: string;
  issueDate: string;
  declName: string;
}

export interface Asset {
  id: number;
  name: string;
  serial: string;
  condition: string;
  remarks: string;
}

export interface Term {
  id: number;
  text: string;
}

export interface DocState {
  fields: Fields;
  introRest: string;
  assets: Asset[];
  objective: string;
  scope: string;
  terms: Term[];
  declaration1: string;
  declaration2: string;
  sigs: Record<SigKey, SigBlock>;
}

import { SIG_META } from "../../shared/document-meta.js";
import { DEFAULT_FORM_CONFIG, missingRequired, presetAsset, type FormConfig } from "../../shared/form-config.js";
export { ASSET_COLUMNS, DEFAULT_FORM_CONFIG, presetAsset, type AssetColumnKey, type FormConfig } from "../../shared/form-config.js";
export { RECIPIENT, LEGAL_NAME, DOC_TITLE, SIG_META, declarationIntro } from "../../shared/document-meta.js";

let counter = 0;
export const uid = () => Date.now() * 1000 + (counter++ % 1000);

const pad = (n: number) => String(n).padStart(2, "0");

export const nowLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const makeRef = () => {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
  return `AMP/AST/${d.getFullYear()}${pad(d.getMonth() + 1)}/${rand}`;
};

const emptySig = (): SigBlock => ({ sig: null, name: "", date: "", signedAt: null });

export const defaultDoc = (config: FormConfig = DEFAULT_FORM_CONFIG): DocState => ({
  fields: {
    refNo: makeRef(),
    employeeName: "",
    employeeId: "",
    designation: "",
    department: "",
    issueDate: nowLocal(),
    declName: "",
  },
  introRest:
    ", acknowledge that the following company assets have been issued to me and are provided subject to the terms and conditions below.",
  assets: config.defaultAssets.map((name) => ({ id: uid(), ...presetAsset(config, name) })),
  objective:
    "AMP Fitness recognizes that use of company-provided assets is necessary for official work and studio operations. Employees are expected to use the assets responsibly and maintain them in good condition.",
  scope:
    "This undertaking must be followed in conjunction with other AMP Fitness policies governing appropriate workplace conduct and behavior. Any employee who abuses, misuses, or fails to take reasonable care of company-provided assets may be denied future assets and, if appropriate, may be subject to disciplinary action or fine, up to and including termination, subject to applicable law and company policy.",
  terms: [
    "All assets provided by AMP Fitness are the property of AMP Fitness and remain company property; they are issued to the employee for official use.",
    "Company assets should be used appropriately, ethically, professionally, and primarily for official work or studio-related purposes.",
    "The employee is responsible for the safekeeping, proper use, and reasonable maintenance of all assets handed over to them.",
    "The employee must not intentionally misuse, damage, alter, lend, transfer, or permit unauthorized use of the company assets.",
    "Any damage or loss caused by misuse, negligence, or failure to take reasonable care, excluding normal wear and tear or depreciation, may require repair or replacement at the employee's cost, subject to applicable company policy and law.",
    "The employee must immediately inform the supervisor or Admin/Operations Department if any asset is lost, damaged, defective, or requires repair.",
    "Company assets must be returned to AMP Fitness upon request, transfer, completion of assignment, resignation, or separation from employment, as applicable.",
    "AMP Fitness reserves the right to examine, monitor, and regulate the usage of company assets, whether onsite or offsite, in accordance with applicable law and company policy.",
    "Questions regarding appropriate use of AMP Fitness LLP's assets should be directed to the employee's supervisor or the Admin/Operations Department.",
  ].map((text) => ({ id: uid(), text })),
  declaration1:
    "I confirm that I have received the above-mentioned company assets in good/recorded condition and have read and understood the terms and conditions stated in this Declaration / Undertaking. I undertake to use the assets appropriately for official purposes, keep them in good condition, report any loss or damage promptly, and return the assets when required by AMP Fitness.",
  declaration2:
    "I understand that any damage caused by misuse or negligence, other than normal wear and tear or depreciation, may be subject to repair/replacement cost in accordance with company policy and applicable law.",
  sigs: { employee: emptySig(), handover: emptySig(), admin: emptySig() },
});


const KEY = "physique57-asset-declaration-v2";

export const loadDoc = (config: FormConfig = DEFAULT_FORM_CONFIG): DocState => {
  const base = defaultDoc(config);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DocState>;
    const fields = { ...base.fields, ...(parsed.fields ?? {}) };
    const employee = employees.find((e) => e.id === fields.employeeId && e.name === fields.employeeName);
    if (employee) {
      fields.designation = employee.designation;
      fields.department = employee.department;
    }
    return {
      ...base,
      ...parsed,
      introRest: (parsed.introRest ?? base.introRest).replace(
        ", working at AMP Fitness as a Full Time Operations Team Member", "",
      ),
      fields,
      sigs: { ...base.sigs, ...(parsed.sigs ?? {}) },
    };
  } catch {
    return base;
  }
};

export const saveDoc = (doc: DocState) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    /* storage unavailable or full – ignore */
  }
};

export const clearSaved = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

/* ───────── Validation ───────── */

export interface Issue {
  label: string;
  required: boolean;
  ok: boolean;
}

export const checkDoc = (d: DocState, config: FormConfig = DEFAULT_FORM_CONFIG): Issue[] => {
  const f = d.fields;
  const filled = (s: string) => s.trim().length > 0;
  return [
    { label: "Employee name", required: true, ok: filled(f.employeeName) },
    { label: "Employee ID", required: true, ok: filled(f.employeeId) },
    { label: "Designation", required: true, ok: filled(f.designation) },
    { label: "Department", required: true, ok: filled(f.department) },
    { label: "Declaration name (\"I, Mr./Ms./Mrs.\")", required: true, ok: filled(f.declName) },
    { label: "At least one asset listed", required: true, ok: d.assets.some((a) => filled(a.name)) },
    ...missingRequired(d.assets, config).map((label) => ({ label: `${label} for every asset`, required: true, ok: false })),
    { label: "Employee signature", required: true, ok: !!d.sigs.employee.sig },
    { label: "Handed Over By signature", required: false, ok: !!d.sigs.handover.sig },
    { label: "Admin / Operations verification signature", required: false, ok: !!d.sigs.admin.sig },
  ];
};

/* ───────── Submission record (what gets logged in the running sheet) ───────── */

export interface SubmissionRecord {
  ref: string;
  submittedAt: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  department: string;
  issueDate: string;
  declName: string;
  assets: { name: string; serial: string; condition: string; remarks: string }[];
  signatures: {
    key: SigKey;
    label: string;
    name: string;
    date: string;
    signed: boolean;
    signedAt: string | null;
    method: "draw" | "type" | null;
  }[];
}

export const toRecord = (d: DocState, ref: string): SubmissionRecord => ({
  ref,
  submittedAt: new Date().toISOString(),
  employeeName: d.fields.employeeName.trim(),
  employeeId: d.fields.employeeId.trim(),
  designation: d.fields.designation.trim(),
  department: d.fields.department.trim(),
  issueDate: d.fields.issueDate,
  declName: d.fields.declName.trim(),
  assets: d.assets
    .filter((a) => a.name.trim())
    .map((a) => ({ name: a.name.trim(), serial: a.serial.trim(), condition: a.condition.trim(), remarks: a.remarks.trim() })),
  signatures: SIG_META.map((m) => {
    const b = d.sigs[m.key];
    return {
      key: m.key,
      label: m.label,
      name: b.name.trim(),
      date: b.date,
      signed: !!b.sig,
      signedAt: b.signedAt,
      method: b.sig?.method ?? null,
    };
  }),
});
