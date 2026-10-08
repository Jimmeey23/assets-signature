import type { DocState } from "./doc";
import { buildPdf as generatePdf } from "../../shared/pdf-engine.js";
import { rasterLogo } from "./logoSvg";
export type { BuiltPdf } from "../../shared/pdf-engine.js";
export async function buildPdf(state: DocState, ref: string) {
  return generatePdf(state, ref, await rasterLogo(240));
}
