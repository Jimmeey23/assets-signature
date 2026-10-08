import type { DocState, SubmissionRecord } from "./doc";
import type { BuiltPdf } from "./pdf";

const EP_KEY = "physique57-submit-endpoint-v2";

export class SubmitError extends Error {}

const envUrl = () => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_SUBMIT_URL;
};

export const getEndpoint = () => {
  try {
    const v = localStorage.getItem(EP_KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  return envUrl() || "/api/submit";
};

export const setEndpoint = (v: string) => {
  try {
    if (v.trim()) localStorage.setItem(EP_KEY, v.trim());
    else localStorage.removeItem(EP_KEY);
  } catch {
    /* ignore */
  }
};

export interface SubmitResult {
  ok: true;
  ref: string;
  sentTo: string;
  rowNumber: number;
  totalSubmissions: number;
  ledgerMode?: "local" | "shared" | "submission";
  notificationStatus?: "Accepted" | "Failed";
  alreadySubmitted?: boolean;
}

export async function submitSubmission(record: SubmissionRecord, pdf: BuiltPdf, document: DocState, invitationToken?: string): Promise<SubmitResult> {
  const url = getEndpoint();
  const body = JSON.stringify({ record, document, invitationToken, pdf: { filename: pdf.filename, base64: pdf.base64 } });
  if (new Blob([body]).size > 4_000_000) {
    throw new SubmitError("The signed PDF is too large for email submission. Please download the PDF and send it manually.");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    throw new SubmitError(
      `Couldn't reach the mail server at ${url}. Check the deployment or update the server address in Settings.`,
    );
  }

  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new SubmitError(
      `The submission endpoint isn't running at ${url} (HTTP ${res.status}). Redeploy the project with its API routes included, or check its address in Settings.`,
    );
  }
  const data = await res.json();
  if (!res.ok || !data.ok) throw new SubmitError(data.error || `The server rejected the submission (HTTP ${res.status}).`);
  return data as SubmitResult;
}

export interface Health {
  ok: boolean;
  apiConfigured?: boolean;
  recipient?: string;
  submissions?: number | null;
  ledgerMode?: "local" | "shared" | "submission";
  from?: string | null;
  error?: string;
}

export async function checkHealth(endpoint: string): Promise<Health> {
  const url = endpoint.replace(/\/submit\/?$/, "/health");
  try {
    const res = await fetch(url);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) return { ok: false, error: `No server found at ${url} (HTTP ${res.status}).` };
    return (await res.json()) as Health;
  } catch {
    return { ok: false, error: `Couldn't reach ${url}. Start the server with \`npm start\`.` };
  }
}
