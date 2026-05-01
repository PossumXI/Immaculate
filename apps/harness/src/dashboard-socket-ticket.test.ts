import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyDashboardSocketTicketFromUrl } from "./dashboard-socket-ticket.js";

function signTicket(payload: object, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

test("dashboard socket tickets preserve real-world engagement evidence", () => {
  const secret = "socket-secret";
  const now = Date.now();
  const ticket = signTicket(
    {
      route: "/stream",
      actor: " dashboard ",
      policyId: " operator-control-default ",
      consentScope: " operator:dashboard ",
      purpose: [" operator-control "],
      receiptTarget: " harness:control:dashboard-socket ",
      operatorSummary: " Dashboard operator control websocket update. ",
      operatorConfirmed: true,
      rollbackPlan: " Restore the last persisted snapshot. ",
      sanitizationProof: " internal-only-control ",
      budgetCents: 0,
      exp: now + 60_000,
      iat: now,
      nonce: "nonce"
    },
    secret
  );

  const claims = verifyDashboardSocketTicketFromUrl(
    `/stream?dashboardTicket=${ticket}`,
    secret,
    now
  );

  assert.deepEqual(claims, {
    route: "/stream",
    actor: "dashboard",
    policyId: "operator-control-default",
    consentScope: "operator:dashboard",
    purpose: ["operator-control"],
    receiptTarget: "harness:control:dashboard-socket",
    operatorSummary: "Dashboard operator control websocket update.",
    operatorConfirmed: true,
    rollbackPlan: "Restore the last persisted snapshot.",
    sanitizationProof: "internal-only-control",
    budgetCents: 0,
    exp: now + 60_000,
    iat: now,
    nonce: "nonce"
  });
});

test("dashboard socket tickets preserve live neuro engagement evidence", () => {
  const secret = "socket-secret";
  const now = Date.now();
  const ticket = signTicket(
    {
      route: "/stream/neuro/live",
      actor: "dashboard",
      policyId: "neuro-stream-default",
      consentScope: "live-source:dashboard-live-socket",
      purpose: ["neuro-streaming"],
      receiptTarget: "harness:neuro-live-socket:dashboard",
      operatorSummary: "Dashboard live neuro socket ingest request.",
      operatorConfirmed: true,
      rollbackPlan: "Close the live socket and stop any source ids acknowledged by the harness.",
      exp: now + 60_000,
      iat: now,
      nonce: "nonce"
    },
    secret
  );

  const claims = verifyDashboardSocketTicketFromUrl(
    `/stream/neuro/live?dashboardTicket=${ticket}`,
    secret,
    now
  );

  assert.deepEqual(claims, {
    route: "/stream/neuro/live",
    actor: "dashboard",
    policyId: "neuro-stream-default",
    consentScope: "live-source:dashboard-live-socket",
    purpose: ["neuro-streaming"],
    receiptTarget: "harness:neuro-live-socket:dashboard",
    operatorSummary: "Dashboard live neuro socket ingest request.",
    operatorConfirmed: true,
    rollbackPlan: "Close the live socket and stop any source ids acknowledged by the harness.",
    sanitizationProof: undefined,
    budgetCents: undefined,
    exp: now + 60_000,
    iat: now,
    nonce: "nonce"
  });
});

test("dashboard socket tickets reject route reuse", () => {
  const secret = "socket-secret";
  const now = Date.now();
  const ticket = signTicket(
    {
      route: "/stream",
      actor: "dashboard",
      policyId: "operator-control-default",
      consentScope: "operator:dashboard",
      purpose: ["operator-control"],
      exp: now + 60_000,
      iat: now,
      nonce: "nonce"
    },
    secret
  );

  assert.equal(
    verifyDashboardSocketTicketFromUrl(`/stream/neuro/live?dashboardTicket=${ticket}`, secret, now),
    null
  );
});
