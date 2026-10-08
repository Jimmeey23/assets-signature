import { DEFAULT_FORM_CONFIG, type FormConfig } from "./doc";

/** Loads the admin-managed asset form settings, falling back to the built-in defaults. */
export async function fetchFormConfig(signal?: AbortSignal): Promise<FormConfig> {
  try {
    const response = await fetch("/api/form-config", { signal, cache: "no-store" });
    const data = await response.json();
    return response.ok && data.ok ? data.config : DEFAULT_FORM_CONFIG;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return DEFAULT_FORM_CONFIG;
  }
}
