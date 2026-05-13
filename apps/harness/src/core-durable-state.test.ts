import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "@immaculate/core";

test("engine durable state does not depend on runtime structuredClone availability", () => {
  const engine = createEngine({ bootstrap: false });
  const originalStructuredClone = globalThis.structuredClone;

  try {
    Object.defineProperty(globalThis, "structuredClone", {
      configurable: true,
      writable: true,
      value: () => {
        throw new DOMException("Data cannot be cloned, out of memory.", "DataCloneError");
      }
    });

    const durableState = engine.getDurableState();
    assert.equal(durableState.snapshot.status, "running");
    assert.equal(Array.isArray(durableState.history), true);
    assert.equal(Array.isArray(durableState.events), true);
  } finally {
    Object.defineProperty(globalThis, "structuredClone", {
      configurable: true,
      writable: true,
      value: originalStructuredClone
    });
  }
});
