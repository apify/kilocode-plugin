import fs from "fs/promises"
import os from "os"
import path from "path"
import { normalizeSecretInput } from "./client.js"

/**
 * Read an API token stored by the Kilo CLI auth command.
 *
 * `kilo auth login --provider apify` writes `{ type: "api", key }` to
 * `<XDG_DATA_HOME>/kilo/auth.json`. This reads that file directly because the
 * plugin's auth hook loader (which would normally surface the value) is only
 * invoked for model providers, not tool plugins. Direct file access lets
 * `kilo auth login` alone enable the tool — no config or env var needed.
 *
 * Returns "" when the file is absent, unreadable, malformed, or holds no api
 * credential for the provider.
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

/** Resolves to `<XDG_DATA_HOME | ~/.local/share>/kilo/auth.json`. */
export function authFilePath(): string {
  const clean = (p: string) => p.replace(/[\r\n]+/g, "").trim()
  const dataHome =
    clean(process.env.XDG_DATA_HOME ?? "") ||
    path.join(clean(os.homedir()), ".local", "share")
  return path.join(dataHome, "kilo", "auth.json")
}
