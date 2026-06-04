import type { ApifyClient } from "apify-client"
import { asOutput, type ActionResult, type RunRef } from "./types.js"
import {
  TERMINAL_STATUSES,
  truncateResults,
  wrapExternalContent,
  externalContentMeta,
} from "../content.js"

/**
 * `collect` — poll a batch of runs and harvest finished ones.
 *
 * Polling lives in the AGENT loop, not here: each call checks status once and
 * returns. The agent watches `allDone` and calls again for `pending` runs.
 *
 * `Promise.allSettled` (not `Promise.all`) so one failed run never kills the
 * batch — if you started five Actors and one died, you still get the other four.
 */

type CompletedEntry = RunRef & { status: string; itemCount: number; items: string }
type PendingEntry = RunRef & { status: string; pending: true }
type ErrorEntry = RunRef & { status?: string; error: string }

async function collectOne(
  client: ApifyClient,
  ref: RunRef,
): Promise<
  | { kind: "completed"; entry: CompletedEntry }
  | { kind: "pending"; entry: PendingEntry }
  | { kind: "error"; entry: ErrorEntry }
> {
  const run = (await client.run(ref.runId).get()) as Record<string, any> | undefined
  const status: string = run?.status ?? "UNKNOWN"

  if (!TERMINAL_STATUSES.has(status)) {
    return { kind: "pending", entry: { ...ref, status, pending: true } }
  }

  if (status !== "SUCCEEDED") {
    return { kind: "error", entry: { ...ref, status, error: `Run ended with status: ${status}` } }
  }

  // Prefer the run's live defaultDatasetId; fall back to the caller's ref.
  const datasetId: string = run?.defaultDatasetId ?? ref.datasetId
  const page = await client.dataset(datasetId).listItems()
  const items = page.items ?? []
  const wrapped = wrapExternalContent(truncateResults(JSON.stringify(items, null, 2)), ref.actorId)

  return {
    kind: "completed",
    entry: { ...ref, status, itemCount: items.length, items: wrapped },
  }
}

export async function collect(
  client: ApifyClient,
  args: { runs?: RunRef[] },
): Promise<ActionResult> {
  const runs = args.runs ?? []
  if (runs.length === 0) {
    return asOutput({
      action: "collect",
      error: "collect requires a non-empty 'runs' array of { runId, actorId, datasetId } references.",
    })
  }

  const completed: CompletedEntry[] = []
  const pending: PendingEntry[] = []
  const errors: ErrorEntry[] = []

  const settled = await Promise.allSettled(runs.map((ref) => collectOne(client, ref)))

  settled.forEach((result, i) => {
    const ref = runs[i]!
    if (result.status === "rejected") {
      errors.push({ ...ref, error: String(result.reason?.message ?? result.reason ?? "Unknown error") })
      return
    }
    const r = result.value
    if (r.kind === "completed") completed.push(r.entry)
    else if (r.kind === "pending") pending.push(r.entry)
    else errors.push(r.entry)
  })

  const allDone = pending.length === 0
  const message = allDone
    ? `${completed.length} completed, ${errors.length} errored. All runs finished.`
    : `${completed.length} completed, ${pending.length} still running, ${errors.length} errored. Call collect again for pending runs.`

  return asOutput(
    { action: "collect", allDone, message, completed, pending, errors },
    completed.length > 0 ? { externalContent: externalContentMeta() } : undefined,
  )
}
