import assert from "node:assert/strict";
import test from "node:test";
import { clampTreeScale, fitViewportToBounds, focusViewport, panViewport, zoomViewport } from "../lib/cifi/mod-tree/viewport.ts";

test("zoom preserves the map position under the pointer", () => {
  const current = { x: -83, y: 28, scale: 1.7 };
  const anchor = { x: 440, y: 123 };
  const result = zoomViewport(current, 2.4, anchor);
  assert.ok(Math.abs((anchor.x - current.x) / current.scale - (anchor.x - result.x) / result.scale) < 1e-10);
  assert.ok(Math.abs((anchor.y - current.y) / current.scale - (anchor.y - result.y) / result.scale) < 1e-10);
});

test("clamped zoom preserves its anchor and stays finite", () => {
  assert.equal(clampTreeScale(-5), 0.5);
  assert.equal(clampTreeScale(99), 10);
  assert.equal(clampTreeScale(Number.NaN), 1);
  assert.deepEqual(zoomViewport({ x: 0, y: 0, scale: 1 }, 100, { x: 10, y: 20 }), { x: -90, y: -180, scale: 10 });
});

test("pan applies one SVG-space delta without a second scale factor", () => {
  assert.deepEqual(panViewport({ x: 100, y: -20, scale: 3 }, { x: 12, y: 50 }, { x: 20, y: 30 }), { x: 108, y: -40, scale: 3 });
});

test("fit uses both dimensions and centers a non-origin block", () => {
  const canvas = { width: 1000, height: 600 };
  const result = fitViewportToBounds({ x: 300, y: 200, width: 400, height: 200 }, canvas, 50);
  assert.equal(result.scale, 2);
  assert.equal(result.x + 500 * result.scale, canvas.width / 2);
  assert.equal(result.y + 300 * result.scale, canvas.height / 2);
  assert.deepEqual(focusViewport({ x: 5, y: 10 }, 2, canvas), { scale: 2, x: 490, y: 280 });
});
