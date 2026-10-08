import { sendJson } from '../server/handlers.mjs';
import { handleWorkflowSubmit } from '../server/workflow.mjs';
export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Use POST to submit a declaration.' }, { Allow: 'POST' });
  return handleWorkflowSubmit(req, res);
}
