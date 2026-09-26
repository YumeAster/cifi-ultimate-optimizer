import assert from "node:assert/strict";
import test from "node:test";
import { publicAssetUrl } from "../lib/cifi/publicAssetUrl.ts";

test("public assets keep the GitHub Pages base in CSS masks", () => {
  assert.equal(publicAssetUrl("/assets/ship-install/cradle-01.png", "/cifi-ultimate-optimizer/"), "/cifi-ultimate-optimizer/assets/ship-install/cradle-01.png");
  assert.equal(publicAssetUrl("./assets/ship-install/rank.png", "/cifi-ultimate-optimizer/"), "/cifi-ultimate-optimizer/assets/ship-install/rank.png");
});

test("public assets also work from the local site root", () => {
  assert.equal(publicAssetUrl("/assets/ship-install/cradle-01.png", "/"), "/assets/ship-install/cradle-01.png");
});
