import { NextResponse } from "next/server";
import {
  clearDashboardSession,
  establishDashboardSession,
  verifyDashboardPassword
} from "../../../lib/operator-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || !verifyDashboardPassword(body.password)) {
    return NextResponse.json(
      {
        error: "invalid_dashboard_credentials",
        message: "Invalid dashboard operator credentials."
      },
      {
        status: 401
      }
    );
  }

  try {
    await establishDashboardSession();
    return NextResponse.json({ authenticated: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "dashboard_session_unavailable",
        message:
          error instanceof Error ? error.message : "Unable to establish dashboard session."
      },
      {
        status: 503
      }
    );
  }
}

export async function DELETE(): Promise<Response> {
  await clearDashboardSession();
  return NextResponse.json({ authenticated: false });
}
