import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pagesConfig from "../vite.pages.config.ts";
import { UPGRADE_RESOURCE_PRESENTATION } from "../features/upgrade-optimizer/resourcePresentation.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const pagesRoot = resolve(projectRoot, pagesConfig.root ?? ".");
const publicRoot = resolve(pagesRoot, pagesConfig.publicDir ?? "public");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function assertPng(path) {
  const data = await readFile(path);
  assert.ok(data.subarray(0, 8).equals(pngSignature), `${path}: expected PNG, not a fallback HTML document`);
  assert.ok(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0, `${path}: invalid dimensions`);
}

test("static and server builds use one canonical public asset directory", () => {
  assert.equal(publicRoot, resolve(projectRoot, "public"));
});

test("the static social preview points to an existing PNG", async () => {
  const html = await readFile(resolve(pagesRoot, "index.html"), "utf8");
  const image = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  assert.ok(image, "social image metadata is missing");
  await assertPng(resolve(publicRoot, image[1]));
});

test("every resource icon resolves in both deployment modes", async () => {
  const icons = new Set(Object.values(UPGRADE_RESOURCE_PRESENTATION).map((resource) => resource.icon));
  assert.equal(icons.size, 14);
  for (const icon of icons) {
    assert.ok(icon.startsWith("./assets/resources/"), `unexpected resource path: ${icon}`);
    await assertPng(resolve(publicRoot, icon));
  }
  assert.equal(UPGRADE_RESOURCE_PRESENTATION.token.icon, UPGRADE_RESOURCE_PRESENTATION.adTokens.icon);
  assert.notEqual(UPGRADE_RESOURCE_PRESENTATION.token.icon, UPGRADE_RESOURCE_PRESENTATION.arcadePoints.icon);
});

test("the Windows launcher keeps the readiness check as a real pipeline", async () => {
  const launcher = await readFile(resolve(projectRoot, "CIFI 서버 실행기.bat"), "utf8");
  assert.doesNotMatch(launcher, /netstat[^\r\n]*\^\|/, "an escaped pipe passes findstr as arguments to netstat");
  assert.match(launcher, /netstat -ano \| findstr/);
  assert.match(launcher, /--host 127\.0\.0\.1/);
  assert.match(launcher, /--strictPort/);
  assert.doesNotMatch(launcher, /taskkill|Stop-Process|netsh\s+advfirewall/i);
});
