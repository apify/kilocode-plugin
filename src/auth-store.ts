import fs from "fs/promises"
import os from "os"
import path from "path"
import { normalizeSecretInput } from "./client.js"

/**
 * Read a token that the user stored via `kilo auth login --provider <id>`.
 *
 * Why this exists: the `auth` hook this plugin registers (see plugin.ts) is the
 * SDK mechanism for *model-provider* credentials — the host only ever invokes a
 * hook's `loader` when it builds a provider whose id matches
 * (kilocode/packages/opencode/src/provider/provider.ts: the
 * `x.auth?.provider === providerID && x.auth.loader` guard). "apify" is a tool
 * plugin, not a model provider, so that loader is never called and its value
 * bag never reaches us. To honor `kilo auth login --provider apify` we therefore
 * read the stored credential straight from Kilo's auth store.
 *
 * Location mirrors the host exactly:
 *   - data dir:  `<XDG_DATA_HOME | ~/.local/share>/kilo`
 *       (kilocode/packages/core/src/global.ts → `Path.data`, app = "kilo")
 *   - file:      `auth.json`, keyed by provider id, value `{ type: "api", key }`
 *       (kilocode/packages/opencode/src/auth/index.ts → `file` + `Api`)
 *
 * Returns "" when the file is absent/unreadable/malformed or holds no api-type
 * credential for `provider`, so callers treat it exactly like "no token".
 */
export async function readStoredApiToken(provider: string): Promise<string> {
  let raw: string
  try {
    raw = await fs.readFile(authFilePath(), "utf8")
  } catch {
    return "" // no auth.json yet (user hasn't run `kilo auth login`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return "" // corrupt store — fail closed, never throw out of plugin init
  }

  const entry =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)[provider]
      : undefined
  if (!entry || typeof entry !== "object") return ""

  const { type, key } = entry as { type?: unknown; key?: unknown }
  if (type !== "api" || typeof key !== "string") return ""

  return normalizeSecretInput(key)
}

/**
 * `<XDG_DATA_HOME | ~/.local/share>/kilo/auth.json`.
 *
 * `xdg-basedir` (the lib Kilo uses) resolves `xdgData` to `$XDG_DATA_HOME` or
 * `~/.local/share` on every platform, with no Windows special-case — we mirror
 * that here so we never drift from where the host wrote the file. Newlines are
 * stripped for the same reason Kilo strips them (a trailing newline on `$HOME`
 * or `$XDG_DATA_HOME` would otherwise corrupt the path).
 */
export function authFilePath(): string {
  const clean = (p: string) => p.replace(/[\r\n]+/g, "").trim()
  const dataHome =
    clean(process.env.XDG_DATA_HOME ?? "") ||
    path.join(clean(os.homedir()), ".local", "share")
  return path.join(dataHome, "kilo", "auth.json")
}
