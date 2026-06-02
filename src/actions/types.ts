/** Shared shapes for the three `apify` actions. */

/**
 * The smallest piece of state an agent needs to come back later and pick up a
 * run's data — see PLUGIN-DESIGN.md §2 ("run reference").
 */
export interface RunRef {
  runId: string
  actorId: string
  datasetId: string
  /** Optional caller-supplied tag, carried through start → collect verbatim. */
  label?: string
}

/** Standard wrapper for every action's structured result. */
export type ActionResult = {
  output: string
  metadata?: { [key: string]: unknown }
}

/** Serialize a structured payload as pretty JSON for the agent. */
export function asOutput(payload: unknown, metadata?: { [key: string]: unknown }): ActionResult {
  return { output: JSON.stringify(payload, null, 2), metadata }
}
