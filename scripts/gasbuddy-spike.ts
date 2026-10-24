/**
 * GasBuddy go/no-go spike: exactly one station lookup (two HTTP requests) from wherever
 * this runs, using the same client as the Worker. Prints a summary and saves the raw
 * response so it can replace the hand-written test fixture.
 *
 *   pnpm spike:gasbuddy [lat] [lon] [--save path]
 *
 * Exit codes: 0 lookup worked, 2 blocked, 3 endpoint or response changed, 4 network error.
 */
import { writeFileSync } from "node:fs";
import { GasBuddyError, searchStations } from "../worker/src/sources/gasbuddy.ts";

const args = process.argv.slice(2);
const saveIdx = args.indexOf("--save");
const savePath = saveIdx >= 0 ? args.splice(saveIdx, 2)[1] : undefined;
// Default: Secaucus, NJ (dense station area next to the NJ Turnpike).
const lat = Number(args[0] ?? 40.7895);
const lon = Number(args[1] ?? -74.0565);

const EXIT_CODES = { blocked: 2, changed: 3, network: 4 } as const;
const started = Date.now();
try {
  const result = await searchStations({ lat, lon });
  if (savePath) writeFileSync(savePath, JSON.stringify(result.raw, null, 2));
  const priced = new Set(result.observations.map((o) => o.gasbuddyId)).size;
  console.log(
    JSON.stringify(
      {
        verdict: result.stations.length > 0 ? "GO" : "NO STATIONS RETURNED",
        point: { lat, lon },
        durationMs: Date.now() - started,
        stations: result.stations.length,
        stationsWithPrice: priced,
        observations: result.observations.length,
        droppedRows: result.droppedRows,
        sample: result.observations.slice(0, 5),
      },
      null,
      2,
    ),
  );
  process.exit(result.stations.length > 0 ? 0 : 3);
} catch (err) {
  if (!(err instanceof GasBuddyError)) throw err;
  console.log(JSON.stringify({ verdict: "NO-GO", error: err.kind, status: err.status ?? null, message: err.message }, null, 2));
  process.exit(EXIT_CODES[err.kind]);
}
