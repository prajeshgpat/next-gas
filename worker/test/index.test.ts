import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index.ts";

const env: Env = { ALLOWED_ORIGINS: "https://prajeshgpat.github.io", LOOKUPS_ENABLED: "true", SPIKE_TOKEN: "secret" };
const call = (path: string, init?: RequestInit, e: Env = env) =>
  worker.fetch(new Request(`https://worker.test${path}`, init), e);

describe("worker", () => {
  it("answers /health with CORS for allowed origins only", async () => {
    const ok = await call("/health", { headers: { Origin: "https://prajeshgpat.github.io" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://prajeshgpat.github.io");
    const other = await call("/health", { headers: { Origin: "https://evil.example" } });
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("hides /spike without the token", async () => {
    expect((await call("/spike?lat=40&lon=-74")).status).toBe(404);
    const noToken = await call("/spike?lat=40&lon=-74", { headers: { Authorization: "Bearer secret" } }, {
      ...env,
      SPIKE_TOKEN: undefined,
    } as unknown as Env);
    expect(noToken.status).toBe(404);
  });

  it("respects the kill switch", async () => {
    const res = await call("/spike?lat=40&lon=-74", { headers: { Authorization: "Bearer secret" } }, {
      ...env,
      LOOKUPS_ENABLED: "false",
    });
    expect(res.status).toBe(503);
  });

  it("validates the point", async () => {
    const res = await call("/spike?lat=400&lon=-74", { headers: { Authorization: "Bearer secret" } });
    expect(res.status).toBe(400);
  });
});
