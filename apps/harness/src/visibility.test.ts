import assert from "node:assert/strict";
import test from "node:test";
import {
  eventEnvelopeSchema,
  resolveArobiNetworkLanePolicy,
  type EventEnvelope
} from "@immaculate/core";
import { projectEventEnvelope } from "./visibility.js";

function buildEvent(lane: EventEnvelope["lane"]): EventEnvelope {
  return {
    eventId: "evt-lane-1",
    eventTimeUtc: "2026-05-13T00:00:00.000Z",
    producer: {
      service: "immaculate",
      instance: "test"
    },
    subject: {
      type: "device",
      id: "sealed-sim-device"
    },
    purpose: ["actuation-output.dispatched"],
    consent: {
      policyId: "test-policy",
      scopeHash: "scope"
    },
    schema: {
      name: "immaculate.actuation-output.dispatched",
      version: "1.1.0"
    },
    lane,
    payload: {
      privateCommand: "sealed command body"
    },
    integrity: {
      hash: "hash"
    },
    summary: "sealed actuation output"
  };
}

test("Arobi network lane policy separates public, private, and zero-zero evidence", () => {
  assert.equal(
    resolveArobiNetworkLanePolicy({
      purpose: ["public-export"],
      subject: { type: "system", id: "release-surface" }
    }).laneId,
    "public"
  );

  assert.equal(
    resolveArobiNetworkLanePolicy({
      purpose: ["audit"],
      subject: { type: "agent", id: "q" }
    }).laneId,
    "private"
  );

  const sealed = resolveArobiNetworkLanePolicy({
    purpose: ["actuation"],
    subject: { type: "device", id: "controlled-simulator" }
  });

  assert.equal(sealed.laneId, "zero-zero");
  assert.equal(sealed.exportScope, "sealed");
  assert.equal(sealed.trainingPolicy, "blocked");
});

test("legacy event envelopes migrate to private audit lane without requiring rewrites", () => {
  const parsed = eventEnvelopeSchema.parse({
    eventId: "evt-legacy-1",
    eventTimeUtc: "2026-05-13T00:00:00.000Z",
    producer: {
      service: "immaculate",
      instance: "legacy"
    },
    subject: {
      type: "agent",
      id: "q"
    },
    purpose: ["audit"],
    consent: {
      policyId: "legacy",
      scopeHash: "legacy"
    },
    schema: {
      name: "immaculate.event",
      version: "1.0.0"
    },
    payload: {
      legacy: true
    },
    integrity: {
      hash: "legacy-hash"
    },
    summary: "legacy event"
  });

  assert.equal(parsed.lane.laneId, "private");
  assert.equal(parsed.lane.trainingPolicy, "allowed-internal");
});

test("non-audit event projection redacts sealed zero-zero lane payload and summary", () => {
  const sealedLane = resolveArobiNetworkLanePolicy({
    purpose: ["actuation"],
    subject: { type: "device", id: "controlled-simulator" }
  });
  const projected = projectEventEnvelope(buildEvent(sealedLane), "system:benchmark");

  assert.equal(projected.summary, "[redacted]");
  assert.equal(projected.payload.privateCommand, undefined);
  assert.equal(projected.payload.laneId, "zero-zero");
  assert.equal(projected.payload.trainingPolicy, "blocked");
});

test("audit event projection preserves sealed lane payload for authorized review", () => {
  const sealedLane = resolveArobiNetworkLanePolicy({
    purpose: ["actuation"],
    subject: { type: "device", id: "controlled-simulator" }
  });
  const projected = projectEventEnvelope(buildEvent(sealedLane), "system:audit");

  assert.equal(projected.summary, "sealed actuation output");
  assert.equal(projected.payload.privateCommand, "sealed command body");
  assert.equal(projected.lane.laneId, "zero-zero");
});
