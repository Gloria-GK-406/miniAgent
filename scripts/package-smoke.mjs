import assert from "node:assert/strict";
import { z } from "zod";

const [root, core, engine, extensions, legacyTool, openai, mcp, legacyMcp] = await Promise.all([
    import("@piaoxianguo/miniagent"),
    import("@piaoxianguo/miniagent/core"),
    import("@piaoxianguo/miniagent/engine"),
    import("@piaoxianguo/miniagent/extensions"),
    import("@piaoxianguo/miniagent/tool"),
    import("@piaoxianguo/miniagent/engine/openai"),
    import("@piaoxianguo/miniagent/extensions/mcp"),
    import("@piaoxianguo/miniagent/tool/mcp"),
]);

assert.equal(typeof root.MiniAgent, "function");
assert.equal(typeof core.MiniAgent, "function");
assert.equal(typeof core.ToolSchema?.safeParse, "function");
assert.equal(typeof engine.OpenAIEngine, "function");
assert.equal(typeof extensions.readTool?.execute, "function");
assert.equal(legacyTool.readTool, extensions.readTool);
assert.equal(typeof openai.OpenAIEngine, "function");
assert.equal(typeof mcp.McpPlugin, "function");
assert.equal(legacyMcp.McpPlugin, mcp.McpPlugin);

const store = new core.MemoryStore();
assert.equal(core.StoreSchema.parse(store), store);
assert.equal(core.StoreSchema.safeParse({}).success, false);

const parameters = z.object({ value: z.string() });
const tool = {
    name: "package-smoke",
    description: "Validate public Tool parameter Schema consumption",
    parameters,
    execute: async ({ value }) => String(value),
};
assert.equal(core.ToolSchema.parse(tool), tool);
assert.equal(z.toJSONSchema(tool.parameters).type, "object");
