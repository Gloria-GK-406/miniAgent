const VERSION = "0.9.1";
const CORE_PACKAGE = "@piaoxianguo/miniagent-core";

const exportTarget = (entry = "index") => ({
  types: `./dist/${entry}.d.ts`,
  import: `./dist/${entry}.js`,
});

export const releasePackageContract = Object.freeze({
  version: VERSION,
  repository: Object.freeze({
    type: "git",
    url: "git+https://github.com/Gloria-GK-406/miniAgent.git",
  }),
  toolchain: Object.freeze({ node: "22.22.0", npm: "10.9.4" }),
  allowedFileClasses: Object.freeze([
    "runtime",
    "declaration",
    "source-map",
    "license",
    "readme",
    "package-metadata",
  ]),
  forbiddenLayers: Object.freeze(["cli", "test"]),
  packages: Object.freeze([
    Object.freeze({
      id: "core",
      name: CORE_PACKAGE,
      source: "dist/core",
      exports: Object.freeze({ ".": exportTarget() }),
      dependencies: Object.freeze({
        eventemitter3: "^5.0.4",
        zod: "^4.4.3",
      }),
    }),
    Object.freeze({
      id: "engine",
      name: "@piaoxianguo/miniagent-engine",
      source: "dist/engine",
      exports: Object.freeze({
        ".": exportTarget(),
        "./anthropic": exportTarget("anthropic/index"),
        "./openai": exportTarget("openai/index"),
        "./openai-compatible": exportTarget("openai-compatible/index"),
        "./glm": exportTarget("glm/index"),
        "./glm-codeplan": exportTarget("glm-codeplan/index"),
        "./nvidia": exportTarget("nvidia/index"),
      }),
      dependencies: Object.freeze({
        [CORE_PACKAGE]: VERSION,
        "@anthropic-ai/sdk": "^0.82.0",
        openai: "^6.33.0",
        zod: "^4.4.3",
      }),
    }),
    Object.freeze({
      id: "extensions",
      name: "@piaoxianguo/miniagent-extensions",
      source: "dist/extensions",
      exports: Object.freeze({
        ".": exportTarget(),
        "./mcp": exportTarget("mcp/index"),
        "./skill": exportTarget("skill/index"),
        "./subagent": exportTarget("subagent"),
      }),
      dependencies: Object.freeze({
        [CORE_PACKAGE]: VERSION,
        "@modelcontextprotocol/sdk": "^1.29.0",
        json5: "^2.2.3",
        yaml: "^2.8.3",
        zod: "^4.4.3",
      }),
    }),
  ]),
});
