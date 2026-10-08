import { LOGO_RATIO, LOGO_URL } from "../lib/logoSvg";

export function Logo({ height = 68, className }: { height?: number; className?: string }) {
  return <img src={LOGO_URL} alt="Physique 57" style={{ height, width: Math.round(height * LOGO_RATIO) }} className={className} draggable={false} />;
}
