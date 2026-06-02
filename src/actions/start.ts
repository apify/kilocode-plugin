import type { ApifyClient } from "apify-client"
import { asOutput, type ActionResult, type RunRef } from "./types.js"

/**
 * `start` — launch an Actor run and return immediately (PLUGIN-DESIGN.md §5).
 *
 * Deliberately does NO per-Actor input validation: Apify validates the input
 * against the Actor's schema and returns a structured error. Re-implementing
 * that here would duplicate the schema and rot the moment an Actor changes.
 *
 * Returns just enough state (the run reference) for `collect` to find the run.
 */
export async function start(
  client: ApifyClient,
  args: { actorId?: string; input?: Record<string, unknown>; label?: string },
): Promise<ActionResult> {
  if (!args.actorId) {
    return asOutput({ action: "start", error: "start requires 'actorId' (username~actor-name)." })
  }

  const input = args.input ?? {}
  const run = (await client.actor(args.actorId).start(input)) as Record<string, any>

  const ref: RunRef = {
    runId: run.id,
    actorId: args.actorId,
    datasetId: run.defaultDatasetId,
  }
  if (args.label) ref.label = args.label

  return asOutput({
    action: "start",
    message: "Actor run started. Use action='collect' with the runs array to fetch results.",
    runs: [{ ...ref, status: run.status }],
  })
}
