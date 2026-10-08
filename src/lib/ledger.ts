import * as XLSX from "xlsx";
import type { SubmissionRecord } from "./doc";

const KEY = "physique57-submissions-ledger-v1";

/** Local copy of submissions made from this browser (used for the offline / fallback sheet). */
export const loadLedger = (): SubmissionRecord[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SubmissionRecord[]) : [];
  } catch {
    return [];
  }
};

export const saveToLedger = (r: SubmissionRecord) => {
  try {
    const all = loadLedger().filter((x) => x.ref !== r.ref);
    all.push(r);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
};

const fmt = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const sigOf = (r: SubmissionRecord, key: string) => r.signatures.find((s) => s.key === key);

const status = (r: SubmissionRecord) => {
  const pending = r.signatures.filter((s) => !s.signed).map((s) => s.label);
  return pending.length === 0 ? "Complete" : `Pending: ${pending.join(", ")}`;
};

export function buildSheet(records: SubmissionRecord[]): Blob {
  const rows = [...records].sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt));

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

  const body = rows.map((r, i) => {
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
      h?.name ?? "",
      h?.signed ? "Yes" : "No",
      a?.name ?? "",
      a?.signed ? "Yes" : "No",
      status(r),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  ws["!cols"] = [8, 24, 20, 24, 14, 20, 18, 20, 10, 56, 14, 20, 22, 14, 24, 16, 28].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: `A1:Q${Math.max(body.length + 1, 2)}` };

  const regHead = ["Submission Ref", "Employee Name", "Employee ID", "Department", "Asset", "Asset / Serial No.", "Condition at Issue", "Remarks", "Issued On"];
  const regBody = rows.flatMap((r) =>
    r.assets.map((x) => [r.ref, r.employeeName, r.employeeId, r.department, x.name, x.serial, x.condition, x.remarks, fmt(r.issueDate)]),
  );
  const ws2 = XLSX.utils.aoa_to_sheet([regHead, ...regBody]);
  ws2["!cols"] = [24, 24, 14, 18, 24, 22, 20, 30, 20].map((wch) => ({ wch }));
  ws2["!autofilter"] = { ref: `A1:I${Math.max(regBody.length + 1, 2)}` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Submissions");
  XLSX.utils.book_append_sheet(wb, ws2, "Asset Register");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export const SHEET_FILENAME = "Physique57_Asset_Declarations_Running_Sheet.xlsx";
