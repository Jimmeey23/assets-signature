export const RECIPIENT = "zahur@physique57mumbai.com";
export const LEGAL_NAME = "AMP FITNESS LLP";
export const DOC_TITLE = "COMPANY ASSET DECLARATION / UNDERTAKING";
export const SIG_META = [
  { key: "employee", label: "Employee Signature" },
  { key: "handover", label: "Handed Over By" },
  { key: "admin", label: "Admin / Operations Verification" },
];
export const declarationIntro = (d) =>
  `, working at AMP Fitness${d.fields.designation.trim() ? ` as ${d.fields.designation.trim()}` : ""}${d.introRest}`;
