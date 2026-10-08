export const SIG_FONTS = [
  { id: "Dancing Script", label: "Classic", weight: 600 },
  { id: "Great Vibes", label: "Elegant", weight: 400 },
  { id: "Caveat", label: "Casual", weight: 600 },
];

const INK = "#111111";

/** Renders typed text in a script font to a tightly-cropped transparent PNG. */
export async function renderTypedSignature(text: string, family: string, weight: number): Promise<string> {
  const size = 130;
  const font = `${weight} ${size}px '${family}', cursive`;
  try {
    await document.fonts.load(font);
  } catch {
    /* use fallback font */
  }
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.font = font;
  const m = ctx.measureText(text);
  const pad = 14;
  c.width = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + pad * 2;
  c.height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2;
  const ctx2 = c.getContext("2d");
  if (!ctx2) return "";
  ctx2.font = font;
  ctx2.fillStyle = INK;
  ctx2.textBaseline = "alphabetic";
  ctx2.fillText(text, pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent);
  return c.toDataURL("image/png");
}

/** Crops a drawing canvas to its ink bounds. Returns null if the canvas is blank. */
export function cropCanvas(src: HTMLCanvasElement, pad = 12): string | null {
  const ctx = src.getContext("2d");
  if (!ctx) return null;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1 + pad * 2;
  const h = maxY - minY + 1 + pad * 2;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(src, minX, minY, maxX - minX + 1, maxY - minY + 1, pad, pad, maxX - minX + 1, maxY - minY + 1);
  return out.toDataURL("image/png");
}
