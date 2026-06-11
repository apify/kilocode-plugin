import type { ApifyClient } from "apify-client"
import { asOutput, type ActionResult } from "./types.js"
import { wrapExternalContent } from "../content.js"

/**
 * `discover` — the agent's "I don't know yet" verb.
 *
 * Two read-only lookups share one action because they share a goal: learn
 * enough to call `start`.
 *   Mode A (query)   → keyword-search the Apify Store.
 *   Mode B (actorId) → fetch an Actor's input schema + README.
 */

const README_CLIP = 3000
const DESC_CLIP = 200

function clip(text: string | undefined | null, max: number): string {
  if (!text) return ""
  return text.length > max ? text.slice(0, max) + "…" : text
}

/** Render an Actor's `username~name` slug from its store/build record. */
function slug(username: string | undefined, name: string | undefined): string {
  if (username && name) return `${username}~${name}`
  return name ?? username ?? "unknown"
}

/** Mode A — keyword search the Store, top 10 by relevance. */
async function searchStore(client: ApifyClient, query: string): Promise<ActionResult> {
  let page: { items?: unknown[] }
  try {
    page = await client.store().list({ search: query, limit: 10, sortBy: "relevance" })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return asOutput({
      action: "discover",
      mode: "search",
      query,
      error: `Store search failed: ${message}`,
    })
  }
  const items = page.items ?? []

  if (items.length === 0) {
    return asOutput({
      action: "discover",
      mode: "search",
      query,
      results: [],
      message: `No Actors found for "${query}". Try broader keywords.`,
    })
  }

  const blocks = items.map((a) => {
    const item = a as Record<string, any>
    const id = slug(item.username, item.name)
    const runs = item.stats?.totalRuns
    const pricing = item.currentPricingInfo?.pricingModel ?? item.pricingInfo?.pricingModel
    const meta = [
      runs != null ? `${Number(runs).toLocaleString("en-US")} runs` : undefined,
      pricing,
    ]
      .filter(Boolean)
      .join(" · ")
    return [
      `### ${item.title ?? item.name ?? id}`,
      `**ID**: \`${id}\`${meta ? ` · ${meta}` : ""}`,
      clip(item.description, DESC_CLIP),
    ].join("\n")
  })

  const markdown = [
    `Found ${items.length} Actor(s) for "${query}":`,
    "",
    blocks.join("\n\n"),
    "",
    "Next: call action='discover' with actorId='<the slug>' to fetch its input schema, then action='start'.",
  ].join("\n")

  return { output: markdown }
}

/** Mode B — fetch an Actor's input schema + README from its default build. */
async function fetchSchema(client: ApifyClient, actorId: string): Promise<ActionResult> {
  let build: Record<string, any> | undefined
  try {
    const buildClient = await client.actor(actorId).defaultBuild()
    build = (await buildClient.get()) as Record<string, any> | undefined
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return asOutput({
      action: "discover",
      mode: "schema",
      actorId,
      error: `Failed to fetch schema for '${actorId}': ${message}`,
    })
  }
  if (!build) {
    return asOutput({
      action: "discover",
      mode: "schema",
      actorId,
      error: `No default build found for Actor '${actorId}'. Check the slug (username~actor-name).`,
    })
  }

  const def = build.actorDefinition as Record<string, any> | undefined
  // Use `actorDefinition.input` — the deprecated `build.inputSchema` string field is not supported.
  const inputSchema: unknown = def?.input

  const raw = clip(def?.readme, README_CLIP)
  const readme = raw ? wrapExternalContent(raw, actorId) : ""

  return asOutput({
    action: "discover",
    mode: "schema",
    actorId,
    name: def?.name,
    username: def?.username,
    title: def?.title,
    description: def?.description,
    inputSchema,
    readme,
    tip: `Use action='start' with actorId='${actorId}' and the input parameters from inputSchema.`,
  })
}

export async function discover(
  client: ApifyClient,
  args: { query?: string; actorId?: string },
): Promise<ActionResult> {
  if (args.actorId) return fetchSchema(client, args.actorId)
  if (args.query) return searchStore(client, args.query)
  return asOutput({
    action: "discover",
    error: "discover requires either 'query' (to search the Store) or 'actorId' (to fetch a schema).",
  })
}
