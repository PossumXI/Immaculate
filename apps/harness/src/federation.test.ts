import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  PRIVATE_00_FEDERATION_LEASE_EXPORT_CLASS,
  PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
  PUBLIC_FEDERATION_LEASE_EXPORT_CLASS,
  PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
  assertFederationPrivate00ExportClaim,
  assertFederationPublicExportClaim,
  buildFederationKeyId,
  classifyFederationWorkerLane,
  isPublicFederationEndpoint,
  sanitizePublicFederationTags,
  signFederationPayload,
  verifyFederationEnvelope
} from "./federation.js";

test("federation key ids are deterministic HMAC identifiers, not raw secret hashes", () => {
  const secret = "federation-shared-secret";
  const keyId = buildFederationKeyId(secret);
  const rawSecretHashPrefix = createHash("sha256").update(secret).digest("hex").slice(0, 12);

  assert.match(keyId, /^[a-f0-9]{12}$/);
  assert.equal(keyId, buildFederationKeyId(secret));
  assert.notEqual(keyId, rawSecretHashPrefix);
});

test("federation envelopes sign and verify with derived key ids", () => {
  const secret = "federation-shared-secret";
  const envelope = signFederationPayload(
    {
      nodeId: "node-a",
      heartbeatAt: "2026-05-01T00:00:00.000Z",
      leaseDurationMs: 30_000
    },
    {
      issuerNodeId: "node-a",
      secret,
      issuedAt: "2026-05-01T00:00:00.000Z"
    }
  );

  assert.equal(envelope.keyId, buildFederationKeyId(secret));
  assert.deepEqual(
    verifyFederationEnvelope(envelope, {
      secret,
      expectedIssuerNodeId: "node-a",
      now: "2026-05-01T00:00:01.000Z"
    }),
    {
      verified: true
    }
  );
});

test("federation envelopes fail closed on tampering and expiry", () => {
  const secret = "federation-shared-secret";
  const envelope = signFederationPayload(
    {
      nodeId: "node-a",
      heartbeatAt: "2026-05-01T00:00:00.000Z",
      leaseDurationMs: 30_000
    },
    {
      issuerNodeId: "node-a",
      secret,
      issuedAt: "2026-05-01T00:00:00.000Z"
    }
  );

  assert.deepEqual(
    verifyFederationEnvelope(
      {
        ...envelope,
        payload: {
          ...envelope.payload,
          nodeId: "node-b"
        }
      },
      {
        secret,
        expectedIssuerNodeId: "node-a",
        now: "2026-05-01T00:00:01.000Z"
      }
    ),
    {
      verified: false,
      reason: "signature mismatch"
    }
  );
  assert.deepEqual(
    verifyFederationEnvelope(envelope, {
      secret,
      expectedIssuerNodeId: "node-a",
      now: "2026-05-01T00:02:01.000Z",
      maxAgeMs: 60_000
    }),
    {
      verified: false,
      reason: "envelope expired"
    }
  );
});

test("public federation lane claims reject missing or private payloads", () => {
  assert.doesNotThrow(() =>
    assertFederationPublicExportClaim(
      {
        federationLane: "public",
        exportClass: PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS
      },
      PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
      "node-a"
    )
  );

  assert.throws(
    () =>
      assertFederationPublicExportClaim(
        {
          federationLane: "private-00",
          exportClass: PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS
        },
        PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
        "node-a"
      ),
    /expected lane public/
  );
  assert.throws(
    () =>
      assertFederationPublicExportClaim(
        {},
        PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
        "node-a"
      ),
    /expected lane public/
  );
});

test("private-00 federation lane claims reject public or mismatched payloads", () => {
  assert.doesNotThrow(() =>
    assertFederationPrivate00ExportClaim(
      {
        federationLane: "private-00",
        exportClass: PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS
      },
      PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
      "private membership"
    )
  );

  assert.throws(
    () =>
      assertFederationPrivate00ExportClaim(
        {
          federationLane: "public",
          exportClass: PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS
        },
        PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
        "private membership"
      ),
    /expected lane private-00/
  );
  assert.throws(
    () =>
      assertFederationPrivate00ExportClaim(
        {
          federationLane: "private-00",
          exportClass: PUBLIC_FEDERATION_LEASE_EXPORT_CLASS
        },
        PRIVATE_00_FEDERATION_LEASE_EXPORT_CLASS,
        "private leases"
      ),
    /expected export class private-00-federation-lease-v1/
  );
});

test("server exposes private-00 federation routes without collapsing public exports", () => {
  const serverSource = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

  assert.match(serverSource, /\/api\/federation\/membership/);
  assert.match(serverSource, /\/api\/federation\/leases/);
  assert.match(serverSource, /\/api\/federation\/private-00\/membership/);
  assert.match(serverSource, /\/api\/federation\/private-00\/leases/);
  assert.match(serverSource, /PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS/);
  assert.match(serverSource, /PUBLIC_FEDERATION_LEASE_EXPORT_CLASS/);
  assert.match(serverSource, /PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS/);
  assert.match(serverSource, /PRIVATE_00_FEDERATION_LEASE_EXPORT_CLASS/);
});

test("public federation worker classifier keeps private and local routes out of public exports", () => {
  assert.equal(isPublicFederationEndpoint("https://workers.example.com/q"), true);
  assert.equal(isPublicFederationEndpoint("http://workers.example.com/q"), false);
  assert.equal(isPublicFederationEndpoint("https://127.0.0.1:8787"), false);

  assert.equal(
    classifyFederationWorkerLane({
      allowHostRisk: false,
      executionEndpoint: "https://workers.example.com/q",
      deviceAffinityTags: ["gpu", "swarm"],
      preferredLayerIds: ["q-public"]
    }),
    "public"
  );
  assert.equal(
    classifyFederationWorkerLane({
      allowHostRisk: true,
      executionEndpoint: "https://workers.example.com/q",
      deviceAffinityTags: ["gpu"],
      preferredLayerIds: ["q-public"]
    }),
    "private-00"
  );
  assert.equal(
    classifyFederationWorkerLane({
      allowHostRisk: false,
      executionEndpoint: "http://127.0.0.1:11434",
      deviceAffinityTags: ["gpu"],
      preferredLayerIds: ["q-public"]
    }),
    "private-00"
  );
  assert.equal(
    classifyFederationWorkerLane({
      allowHostRisk: false,
      executionEndpoint: "http://workers.example.com/q",
      deviceAffinityTags: ["gpu"],
      preferredLayerIds: ["q-public"]
    }),
    "private-00"
  );
  assert.equal(
    classifyFederationWorkerLane({
      allowHostRisk: false,
      executionEndpoint: "https://workers.example.com/q",
      deviceAffinityTags: ["gpu", "00-lane"],
      preferredLayerIds: ["q-public"]
    }),
    "private-00"
  );
  assert.deepEqual(sanitizePublicFederationTags(["gpu", "private-00", "swarm"]), [
    "gpu",
    "swarm"
  ]);
});
