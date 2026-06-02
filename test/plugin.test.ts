import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { server } from "../src/plugin.js"

// The PluginInput is unused by our plugin; pass a minimal stub.
const INPUT = {} as any

describe("plugin registration", () => {
  const saved = { ...process.env }
  beforeEach(() => {
    delete process.env.APIFY_API_KEY
    delete process.env.APIFY_TOKEN
  })
  afterEach(() => {
    process.env = { ...saved }
  })

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

  it("auth loader maps a stored api key into apifyToken", async () => {
    const hooks = await server(INPUT, { token: "apify_api_test" })
    const bag = await hooks.auth!.loader!(async () => ({ type: "api", key: " key123\n" }) as any, {} as any)
    expect(bag).toEqual({ apifyToken: "key123" })
  })

  it("explicit enabled:false registers nothing tool-facing", async () => {
    const hooks = await server(INPUT, { enabled: false, token: "apify_api_test" })
    expect(hooks.tool).toBeUndefined()
  })
})
