import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MiniAgent } from "./agent.js";
import { ThinkingLevel, type LLMGenerateRequest, type ModelRuntime } from "./config.js";
import { LLMStreamChunkType, MessageType, type LLMRequest } from "./types.js";

function runtime(name = "test-model"): ModelRuntime {
  return {
    provider: "test",
    key: "secret",
    model: {
      name,
      thinkingLevels: [ThinkingLevel.None],
    },
  };
}

describe("MiniAgent model runtime", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "miniagent-model-runtime-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("atomically sets one runtime and sends it with generation requests", async () => {
    const requests: LLMGenerateRequest[] = [];
    const llm: LLMRequest = {
      async *streamInvoke(request) {
        requests.push(request);
        yield { type: LLMStreamChunkType.TextDelta, text: "done" };
      },
    };
    const agent = new MiniAgent({
      llm,
      config: { paths: { sessiondir: testDir } },
    });

    agent.setModel(runtime());
    await agent.run({ id: "user", type: MessageType.User, content: "hello" });

    expect(requests[0]?.runtime).toEqual(runtime());
    expect(agent.getModel()).toEqual({
      provider: "test",
      model: {
        name: "test-model",
        thinkingLevels: [ThinkingLevel.None],
      },
    });
    expect(agent.getModel()).not.toHaveProperty("key");
  });

  it("rejects model changes while a run is active", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const llm: LLMRequest = {
      async *streamInvoke() {
        await gate;
        yield { type: LLMStreamChunkType.TextDelta, text: "done" };
      },
    };
    const agent = new MiniAgent({
      llm,
      config: { paths: { sessiondir: testDir } },
    });
    agent.setModel(runtime());

    const running = agent.run({ id: "user", type: MessageType.User, content: "hello" });
    await Promise.resolve();

    expect(() => agent.setModel(runtime("other"))).toThrow(
      "Cannot change model while the agent is running",
    );
    release();
    await running;
  });
});
