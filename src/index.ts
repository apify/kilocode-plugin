import { server } from "./plugin.js"

/**
 * Plugin entry point. Kilo's loader detects published packages via
 * `exports["./server"]` and reads the default export's `{ id, server }`
 * (kilocode/packages/opencode/src/plugin/index.ts).
 */
export default { id: "apify", server }
export { server }
