import logoUrl from "../assets/physique57-logo.png";

/** Original supplied artwork, shared by the screen, print and PDF. */
export const LOGO_RATIO = 514 / 382;
export const LOGO_URL = logoUrl;

export async function rasterLogo(_hPx: number): Promise<string> {
  if (logoUrl.startsWith("data:")) return logoUrl;
  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error("Could not load the Physique 57 logo.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the Physique 57 logo."));
    reader.readAsDataURL(blob);
  });
}

export const getLogoDataUrl = () => rasterLogo(240);
