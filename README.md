# Apify for Kilo

[![Works with Kilo](https://img.shields.io/badge/Works%20with-Kilo-blue)](https://kilo.ai)
[![npm](https://img.shields.io/npm/v/@apify/kilocode-plugin)](https://www.npmjs.com/package/@apify/kilocode-plugin)

`@apify/kilocode-plugin` gives [Kilo Code](https://kilo.ai) agents one native tool — **`apify`** — that can run any of [Apify's](https://apify.com) 20,000+ web-scraping and automation **Actors** and bring the results back into the conversation. Scrape Google Maps, Instagram, Amazon, TikTok, search the web, crawl a site, or invoke any Actor by slug — without a tool-per-site explosion.

> Community integration. "Apify for Kilo" is built and maintained by Apify and is not officially affiliated with Kilo.

## Install

Add a single line to your `kilo.jsonc`:

```jsonc
{
  "plugin": [
    ["@apify/kilocode-plugin", { "token": "{env:APIFY_TOKEN}" }]
  ]
}
```

Then set your token (get one at [console.apify.com/account/integrations](https://console.apify.com/account/integrations)):

```bash
export APIFY_TOKEN="apify_api_..."
```

Or install via the CLI, which patches your config for you:

```bash
kilo plugin @apify/kilocode-plugin
```

### Token sources

The plugin resolves the token in this order:

1. **Kilo auth login** — the plugin registers an **"Apify API Token"** auth method, so you can store the key through Kilo's native auth flow:

   ```bash
   kilo auth login --provider apify   # paste your apify_api_… token
   ```

   This alone is enough — login enables the tool on the next launch, with no config or env var needed.
2. **Config** — `{ "token": "..." }` (or `{ "apiKey": "..." }`) in the `kilo.jsonc` plugin entry.
3. **Environment** — `APIFY_API_KEY` or `APIFY_TOKEN`.

If no token is found, the plugin registers **no tool** (the agent never sees a tool that would fail). After running `kilo auth login`, restart Kilo so the plugin re-reads the credential.

## The `apify` tool

One tool, three actions. The agent composes them:

| Action     | What it does |
|------------|--------------|
| `discover` | Search the Apify Store (`query`), **or** fetch an Actor's input schema + README (`actorId`). |
| `start`    | Launch an Actor run with a JSON `input`; returns run references immediately (non-blocking). |
| `collect`  | Poll the runs; return finished datasets, mark the rest `pending`, surface failures. |

Typical flow: **`discover` (search) → `discover` (schema) → `start` → `collect`** (repeat `collect` while `allDone` is `false`).

### Example (what the agent does under the hood)

```jsonc
// 1. Learn the Actor's inputs
{ "action": "discover", "actorId": "compass~crawler-google-places" }

// 2. Launch a run (batch many targets into ONE run when possible)
{ "action": "start",
  "actorId": "compass~crawler-google-places",
  "input": { "searchStringsArray": ["coffee shop Prague"], "maxCrawledPlacesPerSearch": 3 },
  "label": "prague-coffee" }

// 3. Collect — repeat until allDone: true
{ "action": "collect",
  "runs": [{ "runId": "…", "actorId": "compass~crawler-google-places", "datasetId": "…", "label": "prague-coffee" }] }
```

Slugs use a **tilde**: `username~actor-name` (e.g. `apify~google-search-scraper`), never a slash.

## Safety

- **Prompt-injection defense.** Scraped data is wrapped in `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` markers (with the boundary markers sanitized out of the body) so a host that respects them won't treat scraped text as instructions.
- **Result-size cap.** Dataset output is truncated to 50,000 characters to protect the context window.
- **SSRF guard.** `baseUrl` must start with `https://api.apify.com`.
- **Secret hygiene.** Tokens are newline-stripped before use and never echoed in tool output.

## Configuration

| Field          | Purpose |
|----------------|---------|
| `token` / `apiKey` | Apify API token. Falls back to `APIFY_API_KEY` / `APIFY_TOKEN`. |
| `enabled`      | Force on/off. When unset, the plugin enables itself iff a token is present. |
| `baseUrl`      | Override the Apify API origin. Must start with `https://api.apify.com`. |
| `maxResults`   | Default result cap (forward-looking; currently informational). |
| `enabledTools` | Subset of tools to register (only `apify` exists today). |

## Development

```bash
npm install
npm run build       # tsc → dist/
npm run typecheck
npm test            # vitest, mocked apify-client
```

See [CLAUDE.md](./CLAUDE.md) for architecture notes and local end-to-end testing against a Kilo checkout.

## License

Apache-2.0 © Apify
