import { handleHealth, sendJson } from "../server/handlers.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Use GET to check the mail server." }, { Allow: "GET" });
  try {
    return await handleHealth(req, res);
  } catch (error) {
    console.error("Health check failed", error);
    return sendJson(res, 503, { ok: false, error: "The submissions ledger is unavailable. Please retry." });
  }
}
