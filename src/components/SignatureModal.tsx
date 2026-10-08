import { useEffect, useRef, useState } from "react";
import type { Sig } from "../lib/doc";
import { SIG_FONTS, cropCanvas, renderTypedSignature } from "../lib/sigImage";
import { cn } from "../utils/cn";

interface Props {
  title: string;
  defaultName: string;
  onClose: () => void;
  onSave: (sig: Sig) => void;
}

export default function SignatureModal({ title, defaultName, onClose, onSave }: Props) {
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [text, setText] = useState(defaultName);
  const [font, setFont] = useState(SIG_FONTS[0].id);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (tab !== "draw") return;
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
    setHasInk(false);
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
    setHasInk(true);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const up = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setHasInk(false);
  };

  const canSave = tab === "draw" ? hasInk : text.trim().length > 0;

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      if (tab === "draw" && canvasRef.current) {
        const image = cropCanvas(canvasRef.current);
        if (image) onSave({ method: "draw", image });
      } else {
        const f = SIG_FONTS.find((x) => x.id === font) ?? SIG_FONTS[0];
        const image = await renderTypedSignature(text.trim(), f.id, f.weight);
        onSave({ method: "type", image, text: text.trim() });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-xl">
        <div className="flex items-start justify-between px-6 pb-3 pt-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Sign document</p>
            <h2 className="mt-0.5 text-base font-semibold text-neutral-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex gap-6 border-b border-neutral-200 px-6">
          {(["draw", "type"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px border-b-2 pb-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition",
                tab === t ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-600",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="px-6 py-5">
          {tab === "draw" ? (
            <div>
              <div className="relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50/60">
                <canvas
                  ref={canvasRef}
                  className="block h-44 w-full cursor-crosshair touch-none"
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                />
                {!hasInk && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-neutral-300">
                    Sign here with your mouse, finger or stylus
                  </span>
                )}
                <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-neutral-300" />
              </div>
              <button
                onClick={clear}
                className="mt-2 text-[11px] font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your full name"
                className="w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900"
              />
              <div className="grid gap-2 pt-1">
                {SIG_FONTS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFont(f.id)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-4 py-2 text-left transition",
                      font === f.id ? "border-neutral-900" : "border-neutral-200 hover:border-neutral-400",
                    )}
                  >
                    <span style={{ fontFamily: `'${f.id}', cursive`, fontWeight: f.weight }} className="truncate text-3xl text-neutral-900">
                      {text.trim() || "Your Name"}
                    </span>
                    <span className="ml-3 shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">
                      {f.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-neutral-200 px-6 py-4">
          <p className="max-w-[16rem] text-[10px] leading-relaxed text-neutral-400">
            I agree this electronic signature is the legal equivalent of my handwritten signature.
          </p>
          <div className="flex shrink-0 gap-2">
            <button onClick={onClose} className="rounded-md px-3.5 py-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave || busy}
              className="rounded-md bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-30"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
