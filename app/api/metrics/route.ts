export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expectedToken = process.env.CLOUDY_ACCESS_TOKEN;
  const suppliedToken = new URL(request.url).searchParams.get("token");
  if (expectedToken && suppliedToken !== expectedToken) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const target = process.env.CLOUDY_COLLECTOR_URL || "http://127.0.0.1:6120/metrics";
  try {
    const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!response.ok) return Response.json({ error: "collector unavailable" }, { status: 503 });
    return new Response(await response.text(), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "collector unavailable" }, { status: 503 });
  }
}
