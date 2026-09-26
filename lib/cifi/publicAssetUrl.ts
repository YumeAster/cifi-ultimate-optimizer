/** Resolve a file in public/ for both site-root and GitHub Pages deployments. */
export function publicAssetUrl(path: string, base: string): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path.replace(/^(?:\.\/|\/)+/, "")}`;
}
