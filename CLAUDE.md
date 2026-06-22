# CLAUDE.md — `@apify/kilocode-plugin`

Notes for Claude (and humans) working in this repo: what this package is, what was built, why it's shaped this way, and how to test it.

## What this is

`@apify/kilocode-plugin` ("Apify for Kilo") is a standalone npm plugin for [Kilo Code](https://kilo.ai). It exposes a **single agent-callable tool, `apify`**, that wraps the official [`apify-client`](https://www.npmjs.com/package/apify-client) SDK and lets an agent run any of Apify's 20,000+ Actors through three primitive actions: `discover`, `start`, `collect`.

This is **Path B** from the parent repo's `RESEARCH.md` (a vendor-owned npm plugin, *not* a change to Kilo's source). The design rationale lives in `../PLUGIN-DESIGN.md`; the build plan in `../PLUGIN_PLAN.md`. Path A (an upstream pluggable-web-search PR in the `kilocode/` checkout) was **not** implemented here.

## What was built

A complete, building, tested TypeScript package:

```
src/
├── index.ts          # entry: export default { id: "apify", server }
├── plugin.ts         # the Plugin fn — resolves config, registers tool + auth + chat.headers
├── tool.ts           # the `apify` tool(): Zod args + the agent-facing description + dispatch
├── client.ts         # createApifyClient (telemetry headers), resolveBaseUrl (SSRF guard), normalizeSecretInput
├── auth-store.ts     # readStoredApiToken — reads `kilo auth login` creds from <xdgData>/kilo/auth.json
├── config.ts         # resolveConfig — token precedence + enabled resolution
├── content.ts        # TERMINAL_STATUSES, MAX_RESULT_CHARS, truncateResults, wrapExternalContent
└── actions/
    ├── types.ts      # RunRef + ActionResult helpers
    ├── discover.ts   # Mode A: store search · Mode B: input-schema/README fetch
    ├── start.ts      # client.actor(id).start(input) → run refs (non-blocking)
    └── collect.ts    # Promise.allSettled poll + dataset fetch → completed/pending/errors
test/
├── unit.test.ts      # content, client, config, and all three actions (mocked client)
└── plugin.test.ts    # plugin registration / auth loader / chat.headers
```

24 tests, all passing. `npm run build` and `npm run typecheck` are clean.

## How it works (the short version)

- **`discover`** — `query` searches the Apify Store (`client.store().list`); `actorId` fetches the input schema + README from the Actor's default build (`client.actor(id).defaultBuild()` → `.get()`). Read-only, no compute.
- **`start`** — `client.actor(id).start(input)` and returns immediately with a *run reference* `{ runId, actorId, datasetId, status, label? }`. No per-Actor input validation — Apify validates against the schema.
- **`collect`** — takes run references, polls each with `Promise.allSettled` (one failure can't kill the batch), and buckets into `completed` / `pending` / `errors`. `SUCCEEDED` runs get their dataset fetched, truncated, and wrapped. The agent loops on `allDone`.

The async split (`start` returns, `collect` polls) keeps the agent's turn from blocking on long scrapes. See `../PLUGIN-DESIGN.md` §3.

## Key decisions made during implementation

These deviate from or resolve open items in the design/plan docs — read before changing:

1. **`ctx.ask` is omitted.** The plugin SDK's `ToolContext.ask` returns an `effect` `Effect` that an `async execute` can't cleanly run (verified in `kilocode/packages/plugin/src/tool.ts:20`). Permission gating is left to the host; per-action permission tokens would be informational only. This was the plan's flagged open item.
2. **Auth hook is registered even when disabled.** The plan said "disabled → register nothing." We register **nothing tool-facing** when there's no token, but still expose the `auth` method so a token can be *added* through Kilo's UI (otherwise there's a chicken-and-egg: no token → no auth UI → can't add a token). The `tool` is still gated on a resolved token.

7. **The stored `kilo auth login` token is read directly, not via the hook's value bag.** A token entered with `kilo auth login --provider apify` is persisted to `<xdgData>/kilo/auth.json`, but the host only invokes a plugin auth hook's `loader` (and routes its returned bag) when building a **model provider** whose id matches — guard at `kilocode/packages/opencode/src/provider/provider.ts` (`x.auth?.provider === providerID && x.auth.loader`). "apify" is a tool plugin, not a model provider, so that loader never runs and `resolveConfig`'s `authToken` slot would always be empty. `auth-store.ts:readStoredApiToken` reads the credential straight from the auth store and `plugin.ts` feeds it into that slot, so **`kilo auth login` alone enables the tool** (it occupies the top precedence slot: stored login > options > env). The path mirrors the host: `<XDG_DATA_HOME | ~/.local/share>/kilo/auth.json`, value `{ type: "api", key }`. Requires a Kilo restart after login (plugins resolve config once at startup).
3. **`z.record` needs an explicit key type.** The published `@kilocode/plugin` bundles a zod build where `z.record(value)` is rejected — use `z.record(z.string(), z.any())`.
4. **`makeApifyTool` has an explicit `: ToolDefinition` return annotation.** Without it, `tsc` declaration emit leaks a non-portable path into the SDK's nested `node_modules/zod` (TS2742).
5. **`apify-client` is a real dependency; `@kilocode/plugin` is a devDependency only** — the host provides the plugin SDK at load time.
6. **Telemetry header value is `kilocode`** (the design doc's placeholder was `openclaw`).

## Verified SDK contract (from the `kilocode/` checkout)

- `Plugin = (input, options?) => Promise<Hooks>` — `packages/plugin/src/index.ts:75`.
- Published packages detected via `exports["./server"]`; loader reads `export default { id, server }` — `packages/opencode/src/plugin/install.ts`, `.../plugin/index.ts`.
- Tool authoring: `tool({ description, args, execute })`, `tool.schema` **is** Zod; `execute(args, ctx): Promise<string | { output, metadata }>` — `packages/plugin/src/tool.ts`.
- Auth hook `{ provider, loader, methods:[{type:"api", label}] }` — reference impl `packages/kilo-gateway/src/plugin.ts`.

## How to test it

### 1. Build + unit tests (fast, no token needed)

```bash
cd kilocode-plugin
npm install
npm run typecheck   # must be clean
npm run build       # emits dist/index.js + .d.ts
npm test            # 24 tests, mocked apify-client
```

Quick smoke-test that the entry export is the shape Kilo's loader expects:

```bash
node -e "import('./dist/index.js').then(m => console.log(m.default.id, typeof m.default.server))"
# → apify function
```

### 2. End-to-end against a real Kilo + real Apify token

You need a local `kilocode` checkout (the sibling `../kilocode/` dir) and a real Apify token.

```bash
# Build the plugin first (step 1).
export APIFY_TOKEN="apify_api_..."
```

Point a local `kilo.jsonc` at the built package via a `file://` spec:

```jsonc
{
  "plugin": [
    ["file:///Users/gokdenizkaymak/apify/kilocode-folder/kilocode-plugin", { "token": "{env:APIFY_TOKEN}" }]
  ]
}
```

Then run Kilo's dev loop from the `kilocode/` checkout:

```bash
cd ../kilocode
bun install
bun dev
```

Ask the agent something that needs scraping, e.g.:

> "Get me the top 3 coffee shops on Google Maps in Prague with their phone numbers."

**What to look for (the happy path):**
- The agent calls `apify` with `action: "discover"` (schema mode) for `compass~crawler-google-places`, then `action: "start"`, then `action: "collect"` one or more times.
- `collect` returns `allDone: false` while the run is `RUNNING`, then `allDone: true` with rows under `completed`.
- The returned rows are wrapped in `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` … `<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>` markers with a `Source: apify:…` header.

**Verify the auth hook:** in Kilo's auth UI, an **"Apify API Token"** method should appear; a token entered there flows through the plugin's `loader` (you can confirm validity out-of-band with `curl -H "Authorization: Bearer $APIFY_TOKEN" https://api.apify.com/v2/users/me`).

### 3. Targeted manual checks

- **No token → no tool.** Remove the token/env and confirm the agent does *not* see an `apify` tool (but the auth method still appears).
- **SSRF guard.** Set `"baseUrl": "https://evil.example.com"` and confirm the client construction throws.
- **Batching.** Give a task with several targets and confirm the agent issues **one** `start` with an array input rather than N single-target runs (driven by the tool description).

## Gotchas

- **Bun runtime.** Kilo loads plugins under Bun; we build to ESM (`type: "module"`, `NodeNext`). Keep imports extension-ful (`./plugin.js`) — required by `NodeNext`.
- **Install scripts are blocked** by Kilo's loader for safety; the package must work with just its published `dist/`.
- **`PLUGIN_VERSION` in `src/plugin.ts`** is hand-synced to `package.json` for the attribution header — bump both together.
- The agent-facing **tool description in `src/tool.ts` is the real contract** with the model (slug format, batching, the known-Actor catalog). Treat edits to it as behavior changes, not docs.

## Not done / out of scope here

- Path A (upstream pluggable-web-search provider in `kilocode/`).
- The marketplace PR to `Kilo-Org/kilo-marketplace`.
- Publishing to npm (`npm publish --access public`) and CI (PR typecheck/test + nightly `@kilocode/plugin` compatibility check).
