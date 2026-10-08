import type { Asset } from "../src/lib/doc";
export type AssetColumnKey = "name" | "serial" | "condition" | "remarks";
export interface ColumnConfig { required: boolean; options: string[]; preset: string; }
export interface FormConfig { columns: Record<AssetColumnKey, ColumnConfig>; defaultAssets: string[]; }
export const ASSET_COLUMNS: { key: AssetColumnKey; label: string }[];
export const DEFAULT_FORM_CONFIG: FormConfig;
export function normalizeFormConfig(input: unknown): FormConfig;
export function presetAsset(config: FormConfig, name?: string): Omit<Asset, "id">;
export function missingRequired(assets: Pick<Asset, AssetColumnKey>[], config: FormConfig): string[];
