import { handleSubmit, sendJson } from "../server/handlers.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Use POST to submit a declaration." }, { Allow: "POST" });
  try {
    return await handleSubmit(req, res);
  } catch (error) {
    console.error("Submission handler failed", error);
    return sendJson(res, 500, { ok: false, error: "Unexpected submission error. Please retry." });
  }
}
