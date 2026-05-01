import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export type GovernanceRequest = {
  purpose: string[];
  policyId: string;
  consentScope: string;
  actor?: string;
  receiptTarget?: string;
  operatorSummary?: string;
  operatorConfirmed?: boolean;
  rollbackPlan?: string;
  sanitizationProof?: string;
  budgetCents?: number;
};

export type DashboardSocketRoute = "/stream" | "/stream/neuro/live";

const DASHBOARD_SESSION_COOKIE = "immaculate_dashboard_session";
const DASHBOARD_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const DASHBOARD_SOCKET_TICKET_DURATION_MS = 60 * 1000;

type DashboardSessionPayload = {
  exp: number;
  iat: number;
  scope: "dashboard-operator-session";
};

type DashboardSocketTicketPayload = {
  route: DashboardSocketRoute;
  actor: string;
  policyId: string;
  consentScope: string;
  purpose: string[];
  receiptTarget?: string;
  operatorSummary?: string;
  operatorConfirmed?: boolean;
  rollbackPlan?: string;
  sanitizationProof?: string;
  budgetCents?: number;
  exp: number;
  iat: number;
  nonce: string;
};

function readHarnessApiKey(): string | null {
  return process.env.IMMACULATE_API_KEY?.trim() || null;
}

function getDashboardPassword(): string | null {
  return process.env.IMMACULATE_DASHBOARD_PASSWORD?.trim() || readHarnessApiKey();
}

function getDashboardSessionSecret(): string | null {
  return process.env.IMMACULATE_DASHBOARD_SESSION_SECRET?.trim() || readHarnessApiKey();
}

function getDashboardSocketSecret(): string | null {
  return process.env.IMMACULATE_DASHBOARD_SOCKET_SECRET?.trim() || readHarnessApiKey();
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signTokenPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function encodeTokenPayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeTokenPayload<T>(encodedPayload: string): T | null {
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function buildSignedToken(payload: object, secret: string): string {
  const encodedPayload = encodeTokenPayload(payload);
  return `${encodedPayload}.${signTokenPayload(encodedPayload, secret)}`;
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

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 2000) : undefined;
}

function normalizeOptionalBudgetCents(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.round(value);
}

function normalizeGovernanceRequest(governance: GovernanceRequest): GovernanceRequest {
  return {
    purpose: Array.from(
      new Set(
        governance.purpose
          .flatMap((value) => value.split(","))
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ),
    policyId: governance.policyId.trim(),
    consentScope: governance.consentScope.trim(),
    actor: normalizeOptionalText(governance.actor),
    receiptTarget: normalizeOptionalText(governance.receiptTarget),
    operatorSummary: normalizeOptionalText(governance.operatorSummary),
    operatorConfirmed:
      typeof governance.operatorConfirmed === "boolean" ? governance.operatorConfirmed : undefined,
    rollbackPlan: normalizeOptionalText(governance.rollbackPlan),
    sanitizationProof: normalizeOptionalText(governance.sanitizationProof),
    budgetCents: normalizeOptionalBudgetCents(governance.budgetCents)
  };
}

function isValidGovernanceRequest(value: unknown): value is GovernanceRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GovernanceRequest>;
  return (
    Array.isArray(candidate.purpose) &&
    candidate.purpose.every((entry) => typeof entry === "string" && entry.trim().length > 0) &&
    typeof candidate.policyId === "string" &&
    candidate.policyId.trim().length > 0 &&
    typeof candidate.consentScope === "string" &&
    candidate.consentScope.trim().length > 0 &&
    (candidate.actor === undefined ||
      (typeof candidate.actor === "string" && candidate.actor.trim().length > 0)) &&
    (candidate.receiptTarget === undefined ||
      (typeof candidate.receiptTarget === "string" && candidate.receiptTarget.trim().length > 0)) &&
    (candidate.operatorSummary === undefined ||
      (typeof candidate.operatorSummary === "string" &&
        candidate.operatorSummary.trim().length > 0)) &&
    (candidate.operatorConfirmed === undefined ||
      typeof candidate.operatorConfirmed === "boolean") &&
    (candidate.rollbackPlan === undefined ||
      (typeof candidate.rollbackPlan === "string" && candidate.rollbackPlan.trim().length > 0)) &&
    (candidate.sanitizationProof === undefined ||
      (typeof candidate.sanitizationProof === "string" &&
        candidate.sanitizationProof.trim().length > 0)) &&
    (candidate.budgetCents === undefined ||
      (typeof candidate.budgetCents === "number" &&
        Number.isFinite(candidate.budgetCents) &&
        candidate.budgetCents >= 0))
  );
}

export function verifyDashboardPassword(password: string): boolean {
  const expectedPassword = getDashboardPassword();
  return Boolean(expectedPassword && safeEqualText(password.trim(), expectedPassword));
}

export async function establishDashboardSession(): Promise<void> {
  const sessionSecret = getDashboardSessionSecret();
  if (!sessionSecret) {
    throw new Error(
      "Dashboard sessions require IMMACULATE_DASHBOARD_SESSION_SECRET or IMMACULATE_API_KEY."
    );
  }

  const cookieStore = await cookies();
  const now = Date.now();
  cookieStore.set({
    name: DASHBOARD_SESSION_COOKIE,
    value: buildSignedToken(
      {
        exp: now + DASHBOARD_SESSION_DURATION_MS,
        iat: now,
        scope: "dashboard-operator-session"
      } satisfies DashboardSessionPayload,
      sessionSecret
    ),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(DASHBOARD_SESSION_DURATION_MS / 1000)
  });
}

export async function clearDashboardSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: DASHBOARD_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export function verifyDashboardSessionToken(token: string | null | undefined, now = Date.now()): boolean {
  const sessionSecret = getDashboardSessionSecret();
  if (!sessionSecret) {
    return false;
  }

  const payload = verifySignedToken<DashboardSessionPayload>(token, sessionSecret);
  return Boolean(payload && payload.scope === "dashboard-operator-session" && payload.exp > now);
}

export async function isDashboardSessionActive(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyDashboardSessionToken(cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value);
}

export function createDashboardSocketTicket(options: {
  route: DashboardSocketRoute;
  governance: GovernanceRequest;
}, now = Date.now()): string {
  const socketSecret = getDashboardSocketSecret();
  if (!socketSecret) {
    throw new Error(
      "Dashboard websocket tickets require IMMACULATE_DASHBOARD_SOCKET_SECRET or IMMACULATE_API_KEY."
    );
  }

  if (options.route !== "/stream" && options.route !== "/stream/neuro/live") {
    throw new Error(`Unsupported dashboard socket route ${options.route}.`);
  }

  const governance = normalizeGovernanceRequest(options.governance);
  if (!isValidGovernanceRequest(governance) || governance.purpose.length === 0) {
    throw new Error("Dashboard socket tickets require explicit governance metadata.");
  }

  return buildSignedToken(
    {
      route: options.route,
      actor: governance.actor ?? "dashboard",
      policyId: governance.policyId,
      consentScope: governance.consentScope,
      purpose: governance.purpose,
      receiptTarget: governance.receiptTarget,
      operatorSummary: governance.operatorSummary,
      operatorConfirmed: governance.operatorConfirmed,
      rollbackPlan: governance.rollbackPlan,
      sanitizationProof: governance.sanitizationProof,
      budgetCents: governance.budgetCents,
      exp: now + DASHBOARD_SOCKET_TICKET_DURATION_MS,
      iat: now,
      nonce: randomBytes(8).toString("hex")
    } satisfies DashboardSocketTicketPayload,
    socketSecret
  );
}

export function buildHarnessHttpUrl(pathname: string, searchParams?: URLSearchParams): URL {
  if (!pathname.startsWith("/api/")) {
    throw new Error(`Refusing to proxy non-API dashboard path ${pathname}.`);
  }

  const configuredBaseUrl =
    process.env.IMMACULATE_HARNESS_URL?.trim() ||
    process.env.NEXT_PUBLIC_IMMACULATE_HARNESS_URL?.trim() ||
    "http://127.0.0.1:8787";
  const url = new URL(configuredBaseUrl);
  url.pathname = pathname;
  url.search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  return url;
}

export function buildHarnessWebSocketUrl(route: DashboardSocketRoute, ticket: string): string {
  const configuredBaseUrl =
    process.env.IMMACULATE_HARNESS_WS_URL?.trim() ||
    process.env.NEXT_PUBLIC_IMMACULATE_HARNESS_WS_URL?.trim() ||
    process.env.IMMACULATE_HARNESS_URL?.trim() ||
    process.env.NEXT_PUBLIC_IMMACULATE_HARNESS_URL?.trim() ||
    "http://127.0.0.1:8787";
  const url = new URL(configuredBaseUrl);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  url.pathname = route;
  url.search = "";
  url.searchParams.set("dashboardTicket", ticket);
  return url.toString();
}

export function getDashboardProxyHeaders(request: Request): Headers {
  const headers = new Headers();
  const harnessApiKey = readHarnessApiKey();
  if (harnessApiKey) {
    headers.set("authorization", `Bearer ${harnessApiKey}`);
  }

  for (const key of [
    "content-type",
    "accept",
    "x-immaculate-purpose",
    "x-immaculate-policy-id",
    "x-immaculate-consent-scope",
    "x-immaculate-actor"
  ]) {
    const value = request.headers.get(key);
    if (value) {
      headers.set(key, value);
    }
  }

  return headers;
}
