import { z } from "zod";
import {
  MemoryStore,
  StoreSchema,
  ToolSchema,
  createFunctionSchema,
  createProtocolSchema,
  type Store,
} from "@piaoxianguo/miniagent/core";

const memoryStore = new MemoryStore();
const store: Store = StoreSchema.parse(memoryStore);

const parameters = z.object({ value: z.string() });
const tool = ToolSchema.parse({
  name: "consumer-tool",
  description: "Consumer type smoke",
  parameters,
  execute: async (args: Record<string, unknown>): Promise<string> => String(args["value"]),
});

const callback = createFunctionSchema<(value: string) => number>().parse(
  (value: string) => value.length,
);
const ServiceSchema = createProtocolSchema({
  run: createFunctionSchema<() => Promise<void>>(),
});
const service = ServiceSchema.parse({ run: async (): Promise<void> => {} });
const jsonSchema = z.toJSONSchema(tool.parameters);

void store;
void callback;
void service;
void jsonSchema;
