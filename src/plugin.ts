import type { ApifyClient } from "apify-client"
import type { Plugin, Hooks } from "@kilocode/plugin"
import { resolveConfig, type ApifyPluginOptions } from "./config.js"
import { createApifyClient } from "./client.js"
import { readStoredApiToken } from "./auth-store.js"
import { makeApifyTool } from "./tool.js"
import pkg from "../package.json" with { type: "json" }

/**
 * The Apify plugin for Kilo Code.
 *
 * Resolves an Apify API token from a token stored via `kilo auth login
 * --provider apify` / the config tuple / env, registers the single `apify` tool
 * plus a native Kilo auth method ("Apify API Token") and an attribution header.
 * If no token is configured and `enabled` is not forced on, the plugin registers
 * nothing — so the agent never sees a tool that would fail.
 */
export const server: Plugin = async (_input, options): Promise<Hooks> => {
  const storedToken = await readStoredApiToken("apify")
  const cfg = resolveConfig(options as ApifyPluginOptions | undefined, storedToken)

  // The auth method exposes "Apify API Token" in Kilo's auth UI so a token can
  // be entered via `kilo auth login --provider apify`. There is no loader here
  // because Kilo's host only invokes plugin auth loaders for model providers, not
  // tool plugins. Token resolution is handled by readStoredApiToken (direct file
  // read of the auth store), not through this hook's value bag.
  const auth: Hooks["auth"] = {
    provider: "apify",
    methods: [{ type: "api", label: "Apify API Token" }],
  }

  if (!cfg.enabled) {
    return { auth }
  }

  let client: ApifyClient | undefined
  const getClient = (): ApifyClient => {
    if (!client) client = createApifyClient(cfg.apiKey, cfg.baseUrl)
    return client
  }

  return {
    tool: {
      apify: makeApifyTool(getClient),
    },
    auth,
    "chat.headers": async (_in, output) => {
      output.headers["Apify-User-Agent"] = `apify-kilocode-plugin/${pkg.version}`
    },
  }
}
