import type { CSSProperties } from "react";

/** Tint an original transparent game sprite without recoloring the source file. */
export default function ResourceIcon({ icon, color, className = "", label }: { icon: string; color?: string; className?: string; label?: string }) {
  const style = {
    backgroundColor: color ?? "currentColor",
    maskImage: `url("${icon}")`,
    WebkitMaskImage: `url("${icon}")`,
  } as CSSProperties;
  return <span className={`resource-asset-icon ${className}`} style={style} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
