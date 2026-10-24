/**
 * NextGas price proxy. M0 only has the go/no-go spike: one GasBuddy lookup on demand,
 * guarded by a secret token. Per-ride lookups, caching and rate limits come in M2.
 */
import { GasBuddyError, searchStations } from "./sources/gasbuddy.ts";

export interface Env {
  ALLOWED_ORIGINS: string;
  LOOKUPS_ENABLED: string;
  SPIKE_TOKEN?: string;
}

function json(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

function readPoint(url: URL): { lat: number; lon: number } | null {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const valid = url.searchParams.has("lat") && url.searchParams.has("lon") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return valid ? { lat, lon } : null;
}

async function spike(request: Request, env: Env): Promise<Response> {
  // Hidden unless a token is configured, and only for callers that present it.
  if (!env.SPIKE_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.SPIKE_TOKEN}`) {
    return json({ error: "not_found" }, 404);
  }
  if (env.LOOKUPS_ENABLED !== "true") return json({ ok: false, error: "lookups_disabled" }, 503);
  const point = readPoint(new URL(request.url));
  if (!point) return json({ error: "lat and lon query parameters are required" }, 400);

  const started = Date.now();
  try {
    const result = await searchStations(point);
    return json(
      {
        ok: true,
        durationMs: Date.now() - started,
        stations: result.stations.length,
        observations: result.observations.length,
        droppedRows: result.droppedRows,
        sample: result.observations.slice(0, 5),
      },
      200,
    );
  } catch (err) {
    if (err instanceof GasBuddyError) {
      return json({ ok: false, error: err.kind, status: err.status ?? null, message: err.message }, 502);
    }
    throw err;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, lookupsEnabled: env.LOOKUPS_ENABLED === "true" }, 200, corsHeaders(request, env));
    }
    if (request.method === "GET" && url.pathname === "/spike") return spike(request, env);
    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
