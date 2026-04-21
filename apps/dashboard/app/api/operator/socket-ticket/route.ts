import { NextResponse } from "next/server";
import {
  buildHarnessWebSocketUrl,
  createDashboardSocketTicket,
  isDashboardSessionActive,
  type DashboardSocketRoute,
  type GovernanceRequest
} from "../../../lib/operator-auth";

export const dynamic = "force-dynamic";

function isSupportedSocketRoute(value: string): value is DashboardSocketRoute {
  return value === "/stream" || value === "/stream/neuro/live";
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isDashboardSessionActive())) {
    return NextResponse.json(
      {
        error: "dashboard_unauthorized",
        message: "Dashboard authentication is required."
      },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    route?: string;
    governance?: GovernanceRequest;
  } | null;

  if (!body?.route || !isSupportedSocketRoute(body.route) || !body.governance) {
    return NextResponse.json(
      {
        error: "invalid_socket_ticket_request",
        message: "Socket route and governance are required."
      },
      { status: 400 }
    );
  }

  try {
    const ticket = createDashboardSocketTicket({
      route: body.route,
      governance: body.governance
    });

    return NextResponse.json({
      url: buildHarnessWebSocketUrl(body.route, ticket),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "dashboard_socket_ticket_unavailable",
        message:
          error instanceof Error ? error.message : "Unable to create dashboard websocket ticket."
      },
      { status: 503 }
    );
  }
}
