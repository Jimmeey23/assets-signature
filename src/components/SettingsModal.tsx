import { useState } from "react";
import { RECIPIENT } from "../lib/doc";
import { checkHealth, getEndpoint, setEndpoint, type Health } from "../lib/submit";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(getEndpoint());
  const [health, setHealth] = useState<Health | null>(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    setHealth(await checkHealth(url.trim() || "/api/submit"));
    setTesting(false);
  };

  const save = () => {
    setEndpoint(url);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-xl bg-white p-7 shadow-2xl sm:rounded-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Settings</p>
        <h2 className="mt-0.5 text-lg font-semibold text-neutral-900">Email delivery</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
          Submissions are sent by this server through the Mailtrap Email Sending API to{" "}
          <span className="font-medium text-neutral-900">{RECIPIENT}</span>.
        </p>

        <label className="mt-5 block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Mail server address</span>
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setHealth(null);
            }}
            placeholder="/api/submit"
            className="mt-1 w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900"
          />
          <span className="mt-1 block text-[11px] text-neutral-400">
            Leave as <code>/api/submit</code> when the page is served by the mail server itself (after <code>npm start</code>).
          </span>
        </label>

        {health && (
          <p
            className={`mt-4 rounded-md px-3 py-2.5 text-xs leading-relaxed ${
              health.ok && health.apiConfigured
                ? "bg-neutral-100 text-neutral-800"
                : health.ok
                  ? "bg-amber-50 text-amber-800"
                  : "bg-red-50 text-red-700"
            }`}
          >
            {health.ok
              ? health.apiConfigured
                ? `Mail server configured${health.ledgerMode === "submission" ? " · PDF and submission details emailed" : ` · ${health.submissions ?? 0} submission(s) logged`}.`
                : "Mailtrap isn't configured yet. Add MAILTRAP_API_TOKEN and MAILTRAP_FROM in Vercel Environment Variables, then redeploy."
              : health.error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button onClick={test} disabled={testing} className="text-xs font-semibold text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline disabled:opacity-40">
            {testing ? "Testing…" : "Test connection"}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3.5 py-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100">
              Cancel
            </button>
            <button onClick={save} className="rounded-md bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
