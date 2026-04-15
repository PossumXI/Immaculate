export function authorizeRequest(request: Request, expectedKey: string | undefined): Response | null {
  const trimmed = expectedKey?.trim();
  if (!trimmed) {
    return null;
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (token && token === trimmed) {
    return null;
  }

  return new Response(
    JSON.stringify({
      error: {
        message: "Unauthorized",
        type: "auth_error"
      }
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
}
