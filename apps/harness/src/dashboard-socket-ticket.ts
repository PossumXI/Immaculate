import { createHmac, timingSafeEqual } from "node:crypto";

export type DashboardSocketTicketClaims = {
  route: "/stream" | "/stream/neuro/live";
  actor: string;
  policyId: string;
  consentScope: string;
  purpose: string[];
  exp: number;
  iat: number;
  nonce: string;
};

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signTokenPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function decodeTokenPayload<T>(encodedPayload: string): T | null {
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function verifySignedToken<T>(token: string | null | undefined, secret: string): T | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signTokenPayload(encodedPayload, secret);
  if (!safeEqualText(signature, expectedSignature)) {
    return null;
  }

  return decodeTokenPayload<T>(encodedPayload);
}

function isSupportedRoute(route: string): route is DashboardSocketTicketClaims["route"] {
  return route === "/stream" || route === "/stream/neuro/live";
}

export function verifyDashboardSocketTicketFromUrl(
  urlValue: string | undefined,
  secret: string | null | undefined,
  now = Date.now()
): DashboardSocketTicketClaims | null {
  if (!urlValue || !secret?.trim()) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(urlValue, "http://127.0.0.1");
  } catch {
    return null;
  }

  const payload = verifySignedToken<DashboardSocketTicketClaims>(
    url.searchParams.get("dashboardTicket"),
    secret.trim()
  );
  if (!payload) {
    return null;
  }

  if (
    !isSupportedRoute(payload.route) ||
    payload.route !== url.pathname ||
    typeof payload.actor !== "string" ||
    payload.actor.trim().length === 0 ||
    typeof payload.policyId !== "string" ||
    payload.policyId.trim().length === 0 ||
    typeof payload.consentScope !== "string" ||
    payload.consentScope.trim().length === 0 ||
    !Array.isArray(payload.purpose) ||
    payload.purpose.length === 0 ||
    payload.purpose.some((entry) => typeof entry !== "string" || entry.trim().length === 0) ||
    typeof payload.exp !== "number" ||
    payload.exp <= now
  ) {
    return null;
  }

  return {
    ...payload,
    actor: payload.actor.trim(),
    policyId: payload.policyId.trim(),
    consentScope: payload.consentScope.trim(),
    purpose: payload.purpose.map((entry) => entry.trim())
  };
}
