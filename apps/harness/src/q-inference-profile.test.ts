import test from "node:test";
import assert from "node:assert/strict";
import {
  redactQInferenceProfile,
  resolveQInferenceProfile,
  resolveQInferenceProvider
} from "./q-inference-profile.js";

test("Q inference profile keeps the local Ollama defaults explicit", () => {
  const profile = resolveQInferenceProfile({});

  assert.equal(profile.provider, "ollama");
  assert.equal(profile.routeLabel, "q-primary-ollama");
  assert.equal(profile.runtimeUrl, "http://127.0.0.1:11434");
  assert.deepEqual(profile.requestBounds, {
    maxMessages: 24,
    maxInputChars: 16_000
  });
  assert.equal(profile.timeouts.defaultMs, 120_000);
  assert.equal(profile.timeouts.structuredMs, 45_000);
  assert.equal(profile.timeouts.structuredRepairMs, 12_000);
  assert.equal(profile.circuit.primaryFailureThreshold, 2);
});

test("Q inference profile accepts bounded operator tuning", () => {
  const profile = resolveQInferenceProfile({
    IMMACULATE_Q_INFERENCE_PROVIDER: "ollama",
    IMMACULATE_Q_INFERENCE_ROUTE_LABEL: "oci-proxy-smoke",
    IMMACULATE_Q_OLLAMA_URL: "http://10.0.2.20:11434",
    IMMACULATE_Q_GATEWAY_MAX_MESSAGES: "12",
    IMMACULATE_Q_GATEWAY_MAX_INPUT_CHARS: "32000",
    IMMACULATE_Q_GATEWAY_TIMEOUT_MS: "60000",
    IMMACULATE_Q_GATEWAY_STRUCTURED_TIMEOUT_MS: "90000",
    IMMACULATE_Q_GATEWAY_STRUCTURED_FAST_NUM_CTX: "999999",
    IMMACULATE_Q_GATEWAY_STRUCTURED_FAST_NUM_BATCH: "128",
    IMMACULATE_Q_GATEWAY_PRIMARY_FAILURE_THRESHOLD: "4"
  });

  assert.equal(profile.routeLabel, "oci-proxy-smoke");
  assert.equal(profile.runtimeUrl, "http://10.0.2.20:11434");
  assert.equal(profile.requestBounds.maxMessages, 12);
  assert.equal(profile.requestBounds.maxInputChars, 32_000);
  assert.equal(profile.timeouts.defaultMs, 60_000);
  assert.equal(profile.timeouts.structuredMs, 60_000);
  assert.equal(profile.structured.fastNumCtx, 131_072);
  assert.equal(profile.structured.fastNumBatch, 128);
  assert.equal(profile.circuit.primaryFailureThreshold, 4);
});

test("Q inference profile fails closed on unsupported providers", () => {
  assert.throws(
    () => resolveQInferenceProvider({ IMMACULATE_Q_INFERENCE_PROVIDER: "responses" }),
    /Unsupported Q inference provider/
  );
});

test("redacted Q inference profile does not expose private runtime URLs", () => {
  const profile = resolveQInferenceProfile({
    IMMACULATE_Q_OLLAMA_URL: "http://10.0.2.20:11434"
  });
  const redacted = redactQInferenceProfile(profile);

  assert.equal(redacted.runtime.configured, true);
  assert.equal(redacted.runtime.endpointVisible, false);
  assert.equal("runtimeUrl" in redacted, false);
});
