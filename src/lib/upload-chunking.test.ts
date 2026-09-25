import assert from "node:assert/strict";
import { test } from "node:test";

import { packUploadChunks } from "./upload-chunking";

const MB = 1024 * 1024;

test("agrupa facturas chicas respetando el máximo de facturas por request", () => {
  const { chunks, oversized } = packUploadChunks(
    [[0], [1], [2], [3]],
    [MB / 2, MB / 2, MB / 2, MB / 2],
    { maxBytes: 4 * MB, maxInvoices: 3 },
  );
  assert.deepEqual(
    chunks.map((c) => c.groups),
    [[[0], [1], [2]], [[3]]],
  );
  assert.deepEqual(oversized, []);
});

test("corta por bytes y nunca parte una factura multi-archivo", () => {
  const { chunks } = packUploadChunks(
    [[0, 1], [2], [3]],
    [1.5 * MB, 1.5 * MB, 2 * MB, 1 * MB],
    { maxBytes: 4 * MB, maxInvoices: 10 },
  );
  assert.deepEqual(
    chunks.map((c) => c.groups),
    [[[0, 1]], [[2], [3]]],
  );
});

test("marca como oversized la factura que sola supera el límite", () => {
  const { chunks, oversized } = packUploadChunks(
    [[0], [1, 2], [3]],
    [1 * MB, 3 * MB, 2 * MB, 1 * MB],
    { maxBytes: 4 * MB, maxInvoices: 10 },
  );
  assert.deepEqual(oversized, [[1, 2]]);
  assert.deepEqual(
    chunks.map((c) => c.groups),
    [[[0], [3]]],
  );
});
