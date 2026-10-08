import type { DocState } from "../src/lib/doc";
export interface BuiltPdf { blob: Blob; base64: string; filename: string; }
export function buildPdf(state: DocState, ref: string, logo: string): Promise<BuiltPdf>;
