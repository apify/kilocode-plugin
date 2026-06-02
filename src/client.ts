import { ApifyClient } from "apify-client"

/**
 * Apify client construction and secret hygiene (see PLUGIN-DESIGN.md §8, §11).
 */

const APIFY_BASE_URL = "https://api.apify.com"

/**
 * Strip newline-family characters and surrounding whitespace from a secret.
 *
 * The most common copy-paste failure mode is a trailing newline on an API key,
 * which would corrupt the `Authorization` header downstream. We also strip the
 * Unicode line/paragraph separators (U+2028, U+2029) for completeness.
 */
export function normalizeSecretInput(value: string | undefined | null): string {
  if (!value) return ""
  return value.replace(/[\r\n\u2028\u2029]/g, "").trim()
}

/**
 * Validate / normalize the Apify API origin.
 *
 * `baseUrl` is configurable for forward compatibility (regional endpoints), but
 * we enforce an `https://api.apify.com` prefix so a malicious config can't point
 * the client at an attacker-controlled host and exfiltrate the token (SSRF guard).
 */
export function resolveBaseUrl(override?: string): string {
  if (!override) return APIFY_BASE_URL
  const url = override.trim()
  if (!url.startsWith(APIFY_BASE_URL)) {
    throw new Error(
      `Invalid Apify base URL: must start with "${APIFY_BASE_URL}" (got "${url}")`,
    )
  }
  return url
}

/**
 * Build an `ApifyClient` that tags every request with integration telemetry
 * headers (NOT authentication — they let Apify attribute AI-agent traffic).
 */
export function createApifyClient(apiKey: string, baseUrl?: string): ApifyClient {
  return new ApifyClient({
    token: normalizeSecretInput(apiKey),
    baseUrl: resolveBaseUrl(baseUrl),
    requestInterceptors: [
      (config) => {
        config.headers = {
          ...config.headers,
          "x-apify-integration-platform": "kilocode",
          "x-apify-integration-ai-tool": "true",
        }
        return config
      },
    ],
  })
}
