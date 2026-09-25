import assert from "node:assert/strict";
import { test } from "node:test";

import { safeCallbackUrl } from "./safe-callback-url";

test("acepta rutas internas con query", () => {
  assert.equal(safeCallbackUrl("/history/abc?error=1"), "/history/abc?error=1");
});

test("rechaza URLs absolutas y protocol-relative", () => {
  for (const bad of [
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeCallbackUrl(bad), "/upload", String(bad));
  }
});
