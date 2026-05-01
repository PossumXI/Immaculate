import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildFederationKeyId,
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
