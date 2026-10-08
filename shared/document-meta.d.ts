import type { DocState, SigKey } from "../src/lib/doc";
export const RECIPIENT: string;
export const LEGAL_NAME: string;
export const DOC_TITLE: string;
export const SIG_META: { key: SigKey; label: string }[];
export function declarationIntro(d: DocState): string;
