import { NextResponse } from "next/server";
import {
  buildHarnessHttpUrl,
  getDashboardProxyHeaders,
  isDashboardSessionActive
} from "../../../../lib/operator-auth";

export const dynamic = "force-dynamic";

type HarnessRouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

const DASHBOARD_HARNESS_DELETE_PATHS = [
  /^\/api\/federation\/peers\/[^/]+$/,
  /^\/api\/nodes\/[^/]+$/
] as const;

export function isAllowedDashboardHarnessDeletePath(pathname: string): boolean {
  return DASHBOARD_HARNESS_DELETE_PATHS.some((pattern) => pattern.test(pathname));
}

async function proxyHarnessRequest(request: Request, context: HarnessRouteContext): Promise<Response> {
  if (!(await isDashboardSessionActive())) {
    return NextResponse.json(
      {
        error: "dashboard_unauthorized",
        message: "Dashboard authentication is required."
      },
      { status: 401 }
    );
  }

  const { path } = await context.params;
  const pathname = `/${(path ?? []).join("/")}`;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "invalid_dashboard_proxy_path",
        message: `Refusing to proxy ${pathname}.`
      },
      { status: 400 }
    );
  }

  if (request.method === "DELETE" && !isAllowedDashboardHarnessDeletePath(pathname)) {
    return NextResponse.json(
      {
        error: "dashboard_proxy_delete_not_allowed",
        message: `Refusing to proxy DELETE ${pathname}.`
      },
      {
        status: 405,
        headers: {
          allow: "GET, POST"
        }
      }
    );
  }

  const inboundUrl = new URL(request.url);
  const upstream = await fetch(buildHarnessHttpUrl(pathname, inboundUrl.searchParams), {
    method: request.method,
    headers: getDashboardProxyHeaders(request),
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    cache: "no-store"
  });

  const body = await upstream.arrayBuffer();
  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }

  return new NextResponse(body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

export async function GET(request: Request, context: HarnessRouteContext): Promise<Response> {
  return proxyHarnessRequest(request, context);
}

export async function POST(request: Request, context: HarnessRouteContext): Promise<Response> {
  return proxyHarnessRequest(request, context);
}

export async function DELETE(request: Request, context: HarnessRouteContext): Promise<Response> {
  return proxyHarnessRequest(request, context);
}
