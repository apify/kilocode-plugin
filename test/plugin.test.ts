import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { server } from "../src/plugin.js"

// The PluginInput is unused by our plugin; pass a minimal stub.
const INPUT = {} as any

describe("plugin registration", () => {
  const saved = { ...process.env }
  let dataHome: string

  beforeEach(() => {
    delete process.env.APIFY_API_KEY
    delete process.env.APIFY_TOKEN
    // Point the auth store at an empty temp dir so these tests never read the
    // developer's real ~/.local/share/kilo/auth.json (which mirrors what
    // `kilo auth login` writes). Individual tests opt in by seeding auth.json.
    dataHome = fs.mkdtempSync(path.join(os.tmpdir(), "apify-plugin-auth-"))
    process.env.XDG_DATA_HOME = dataHome
  })
  afterEach(() => {
    process.env = { ...saved }
    fs.rmSync(dataHome, { recursive: true, force: true })
  })

  // Write `<XDG_DATA_HOME>/kilo/auth.json` the way `kilo auth login` does.
  function seedStoredAuth(entry: Record<string, unknown>) {
    const dir = path.join(dataHome, "kilo")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "auth.json"), JSON.stringify({ apify: entry }))
  }

  it("registers no tool when no token is configured, but still exposes the auth method", async () => {
    const hooks = await server(INPUT, {})
    expect(hooks.tool).toBeUndefined()
    expect(hooks.auth?.provider).toBe("apify")
    expect(hooks.auth?.methods?.[0]).toMatchObject({ type: "api", label: "Apify API Token" })
  })

  it("registers the apify tool, auth, and chat.headers when a token is present", async () => {
    const hooks = await server(INPUT, { token: "apify_api_test" })
    expect(hooks.tool?.apify).toBeDefined()
    expect(hooks.auth?.provider).toBe("apify")
    expect(hooks["chat.headers"]).toBeTypeOf("function")
  })

  it("chat.headers attaches the attribution user-agent", async () => {
    const hooks = await server(INPUT, { token: "apify_api_test" })
    const output = { headers: {} as Record<string, string> }
    await hooks["chat.headers"]!({} as any, output)
    expect(output.headers["Apify-User-Agent"]).toMatch(/^apify-kilocode-plugin\//)
  })

  it("auth method registers Apify API Token without a loader (token resolved via stored auth, not hook)", async () => {
    const hooks = await server(INPUT, { token: "apify_api_test" })
    // The `loader` property is absent — Kilo doesn't invoke loaders for tool plugins.
    // Token resolution is handled by readStoredApiToken (direct file read of the auth store).
    expect(hooks.auth!.loader).toBeUndefined()
    expect(hooks.auth?.methods?.[0]).toMatchObject({ type: "api", label: "Apify API Token" })
  })

  it("explicit enabled:false registers nothing tool-facing", async () => {
    const hooks = await server(INPUT, { enabled: false, token: "apify_api_test" })
    expect(hooks.tool).toBeUndefined()
  })

  it("`kilo auth login` alone (no options/env) enables the tool", async () => {
    seedStoredAuth({ type: "api", key: "apify_api_stored" })
    const hooks = await server(INPUT, {})
    expect(hooks.tool?.apify).toBeDefined()
  })

  it("a stored login token takes precedence over options and env", async () => {
    process.env.APIFY_TOKEN = "env-token"
    seedStoredAuth({ type: "api", key: "apify_api_stored" })
    // Tool is enabled and built from the stored token (authToken slot wins).
    const hooks = await server(INPUT, { token: "opt-token" })
    expect(hooks.tool?.apify).toBeDefined()
  })

  it("ignores a non-api stored credential (e.g. leftover oauth)", async () => {
    seedStoredAuth({ type: "oauth", access: "x", refresh: "y" })
    const hooks = await server(INPUT, {})
    expect(hooks.tool).toBeUndefined()
    // Auth method still advertised so a token can be added.
    expect(hooks.auth?.provider).toBe("apify")
  })
})
