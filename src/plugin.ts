import type { ApifyClient } from "apify-client"
import type { Plugin, Hooks } from "@kilocode/plugin"
import { resolveConfig, type ApifyPluginOptions } from "./config.js"
import { createApifyClient, normalizeSecretInput } from "./client.js"
import { readStoredApiToken } from "./auth-store.js"
import { makeApifyTool } from "./tool.js"
import { version } from "../package.json" with { type: "json" }

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

  const auth: Hooks["auth"] = {
    provider: "apify",
    async loader(getAuth) {
      const a = await getAuth()
      if (a?.type === "api") return { apifyToken: normalizeSecretInput(a.key) }
      return {}
    },
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
      output.headers["Apify-User-Agent"] = `apify-kilocode-plugin/${version}`
    },
  }
}
