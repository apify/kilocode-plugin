import type { ApifyClient } from "apify-client"
import type { Plugin, Hooks } from "@kilocode/plugin"
import { resolveConfig, type ApifyPluginOptions } from "./config.js"
import { createApifyClient, normalizeSecretInput } from "./client.js"
import { makeApifyTool } from "./tool.js"

// Bumped manually; mirrors package.json. Used for the attribution header.
const PLUGIN_VERSION = "0.1.0"

/**
 * The Apify plugin (PLUGIN-DESIGN.md, PLUGIN_PLAN.md).
 *
 * Resolves an Apify API token from the config tuple / env, registers the single
 * `apify` tool plus a native Kilo auth method ("Apify API Token") and an
 * attribution header. If no token is configured and `enabled` is not forced on,
 * the plugin registers nothing — so the agent never sees a tool that would fail.
 */
export const server: Plugin = async (_input, options): Promise<Hooks> => {
  const cfg = resolveConfig(options as ApifyPluginOptions | undefined)

  // Native auth hook: lets the token be entered through Kilo's auth UI and maps
  // a stored API key into a value bag (mirrors kilo-gateway's plugin loader).
  const auth: Hooks["auth"] = {
    provider: "apify",
    async loader(getAuth) {
      const a = await getAuth()
      if (a?.type === "api") return { apifyToken: normalizeSecretInput(a.key) }
      return {}
    },
    methods: [{ type: "api", label: "Apify API Token" }],
  }

  // Disabled (no token and not force-enabled): register nothing tool-facing,
  // but still expose the auth method so a token can be added later.
  if (!cfg.enabled) {
    return { auth }
  }

  // Lazily build + cache the client from the resolved token.
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
    // Attribution header so Apify can distinguish AI-agent integration traffic.
    "chat.headers": async (_in, output) => {
      output.headers["Apify-User-Agent"] = `apify-kilocode-plugin/${PLUGIN_VERSION}`
    },
  }
}
