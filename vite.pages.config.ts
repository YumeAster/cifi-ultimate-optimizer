import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// These imported sources live outside the Pages root. Watch their directories
// so creating a file after its import also triggers Vite's recovery path.
export const projectSourceDirectories = ["app", "features", "lib"].map(directory => fileURLToPath(new URL(`./${directory}/`, import.meta.url)));

export default defineConfig({
  // Shared by GitHub Pages builds and their local development preview.
  base: "/cifi-ultimate-optimizer/",
  plugins: [react(), {
    name: "watch-project-sources",
    configureServer(server) {
      server.watcher.add(projectSourceDirectories);
    },
  }],
  root: "pages",
  // Share the exact same source assets with the server build. Keeping another
  // public directory beneath pages previously omitted the social image.
  publicDir: "../public",
  build: {
    outDir: "../dist-pages",
    emptyOutDir: true,
  },
});
