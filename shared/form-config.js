// Admin-managed asset form settings: dropdown options, required columns, preset values and default rows.
export const ASSET_COLUMNS = [
  { key: "name", label: "Company Asset" },
  { key: "serial", label: "Asset / Serial No." },
  { key: "condition", label: "Condition at Issue" },
  { key: "remarks", label: "Remarks" },
];

export const DEFAULT_FORM_CONFIG = {
  columns: {
    name: { required: true, options: [], preset: "" },
    serial: { required: false, options: [], preset: "" },
    condition: { required: false, options: ["New", "Good", "Fair", "Needs repair"], preset: "" },
    remarks: { required: false, options: [], preset: "" },
  },
  defaultAssets: ["Company Laptop", "Laptop Charger", "Mobile Phone", "Cycle Shoe"],
};

const clean = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v, limit) => [...new Set((Array.isArray(v) ? v : []).map((x) => clean(x)).filter(Boolean))].slice(0, limit);

export function normalizeFormConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  const columns = {};
  for (const { key } of ASSET_COLUMNS) {
    const value = source.columns?.[key] ?? DEFAULT_FORM_CONFIG.columns[key];
    columns[key] = { required: key === "name" || Boolean(value.required), options: list(value.options, 100), preset: clean(value.preset, 1000) };
  }
  const defaultAssets = source.defaultAssets === undefined ? DEFAULT_FORM_CONFIG.defaultAssets : list(source.defaultAssets, 100);
  return { columns, defaultAssets };
}

/** A blank asset row carrying the admin's preset values. */
export const presetAsset = (config, name = "") => ({
  name: name || config.columns.name.preset,
  serial: config.columns.serial.preset,
  condition: config.columns.condition.preset,
  remarks: config.columns.remarks.preset,
});

/** Labels of required asset columns left empty on any listed asset. */
export function missingRequired(assets, config) {
  const rows = assets.filter((a) => clean(a.name));
  return ASSET_COLUMNS.filter((c) => c.key !== "name" && config.columns[c.key].required && rows.some((a) => !clean(a[c.key]))).map((c) => c.label);
}
