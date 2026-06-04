import { normalizeSecretInput } from "./client.js"

/**
 * Config resolution.
 *
 * Config arrives from three places, merged here into a single resolved shape:
 *  - the `["@apify/kilocode-plugin", { ... }]` options tuple in `kilo.jsonc`
 *  - the native Kilo auth hook (an entered "Apify API Token")
 *  - the `APIFY_API_KEY` / `APIFY_TOKEN` environment variables
 */

/** Raw options as authored in `kilo.jsonc` (everything optional / untyped). */
export interface ApifyPluginOptions {
  /** Explicit on/off. When unset, the plugin enables iff a token is present. */
  enabled?: boolean
  /** Apify API token. Aliased as `token` for the documented config snippet. */
  apiKey?: string
  token?: string
  /** Override the Apify API origin. Must start with `https://api.apify.com`. */
  baseUrl?: string
  /** Default result cap (forward-looking; currently informational). */
  maxResults?: number
  /** Subset of tools to register. Only `apify` exists today. */
  enabledTools?: string[]
}

export interface ResolvedConfig {
  enabled: boolean
  apiKey: string
  baseUrl?: string
  maxResults?: number
  enabledTools?: string[]
}

function readEnvToken(): string {
  return normalizeSecretInput(
    process.env.APIFY_API_KEY ?? process.env.APIFY_TOKEN ?? "",
  )
}

/**
 * Resolve the effective config from authored options plus an optional token
 * supplied by the auth hook (which takes precedence over env, after options).
 *
 * Token precedence: auth-hook token → options.token/apiKey → env var.
 * `enabled`: explicit boolean wins; otherwise enable iff a token resolved.
 */
export function resolveConfig(
  options: ApifyPluginOptions | undefined,
  authToken?: string,
): ResolvedConfig {
  const opts = options ?? {}

  const apiKey =
    normalizeSecretInput(authToken) ||
    normalizeSecretInput(opts.token ?? opts.apiKey) ||
    readEnvToken()

  const enabled =
    typeof opts.enabled === "boolean" ? opts.enabled : Boolean(apiKey)

  return {
    enabled,
    apiKey,
    baseUrl: opts.baseUrl,
    maxResults: opts.maxResults,
    enabledTools: opts.enabledTools,
  }
}
