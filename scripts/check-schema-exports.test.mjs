import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const detectorPath = path.join(repositoryRoot, "scripts", "check-schema-exports.mjs");

async function runDetector(files) {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "miniagent-schema-exports-"));

  try {
    await Promise.all(
      Object.entries(files).map(async ([relativePath, source]) => {
        const filePath = path.join(fixtureRoot, relativePath);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, source, "utf8");
      }),
    );

    return spawnSync(process.execPath, [detectorPath, fixtureRoot], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

test("rejects directly exported handwritten declarations with actionable diagnostics", async () => {
  const result = await runDetector({
    "invalid.ts": [
      "export interface DirectInterface { value: string }",
      "export enum DirectEnum { Value = 'value' }",
      "export type DirectAlias = { value: string };",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid\.ts:1:\d+.*DirectInterface.*interface/);
  assert.match(result.stderr, /invalid\.ts:2:\d+.*DirectEnum.*enum/);
  assert.match(result.stderr, /invalid\.ts:3:\d+.*DirectAlias.*z\.(?:infer|input|output)/);
});

test("rejects declarations surfaced by a later local export list", async () => {
  const result = await runDetector({
    "later.ts": [
      "interface LaterInterface { value: string }",
      "enum LaterEnum { Value = 'value' }",
      "type LaterAlias = string;",
      "export { LaterInterface, LaterEnum, LaterAlias as PublicAlias };",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /later\.ts:1:\d+.*LaterInterface/);
  assert.match(result.stderr, /later\.ts:2:\d+.*LaterEnum/);
  assert.match(result.stderr, /later\.ts:3:\d+.*LaterAlias/);
});

test("accepts Zod-derived aliases, schema-factory results, and type-only re-exports", async () => {
  const result = await runDetector({
    "derived.ts": [
      'import { z, input as ZodInput } from "zod";',
      "const ItemSchema = z.object({ value: z.string() });",
      "function createSchema() { return ItemSchema; }",
      "export type Item = z.infer<typeof ItemSchema>;",
      "export type ItemInput = ZodInput<typeof ItemSchema>;",
      "export type FactoryItem = z.output<ReturnType<typeof createSchema>>;",
      "type InternalOnly = { value: string };",
    ].join("\n"),
    "index.ts": 'export type { Item, ItemInput, FactoryItem } from "./derived.js";',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /policy passed/i);
});

test("does not mistake lookalike namespaces for Zod derivation", async () => {
  const result = await runDetector({
    "lookalike.ts": [
      "namespace z { export type infer<T> = T; }",
      "export type Lookalike = z.infer<{ value: string }>;",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /lookalike\.ts:2:\d+.*Lookalike/);
});

test("rejects Zod derivation syntax when the operand is not a Zod schema", async () => {
  const result = await runDetector({
    "washed.ts": [
      'import { z } from "zod";',
      "const NotASchema = {} as any;",
      "export type Washed = z.infer<typeof NotASchema>;",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /washed\.ts:3:\d+.*Washed/);
});

test("rejects non-schema exports in project declaration files", async () => {
  const result = await runDetector({
    "hidden.d.ts": "export interface HiddenDeclaration { value: string }",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /hidden\.d\.ts:1:\d+.*HiddenDeclaration/);
});

test("rejects handwritten declarations exported through a public namespace", async () => {
  const result = await runDetector({
    "nested.ts": [
      "namespace Contracts {",
      "  export interface NestedInterface { value: string }",
      "}",
      "export { Contracts };",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /nested\.ts:2:\d+.*NestedInterface/);
});

test("rejects a ZodType assertion that launders an incompatible structure", async () => {
  const result = await runDetector({
    "asserted.ts": [
      'import { z } from "zod";',
      "export const ItemSchema = z.string() as z.ZodType<{ id: string }>;",
      "export type Item = z.infer<typeof ItemSchema>;",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /asserted\.ts:2:\d+.*asserted ZodType.*forbidden/);
});

test("rejects named and angle-bracket ZodType assertion variants", async () => {
  const result = await runDetector({
    "assertion-variants.ts": [
      'import { z, ZodType as SchemaType } from "zod";',
      "export const NamespaceSchema = <z.ZodType<{ id: string }>>z.string();",
      "export const NamedSchema = z.string() as SchemaType<{ id: string }>;",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /assertion-variants\.ts:2:\d+.*asserted ZodType/);
  assert.match(result.stderr, /assertion-variants\.ts:3:\d+.*asserted ZodType/);
});

test("rejects predicate-free structural and service custom Schemas", async () => {
  const result = await runDetector({
    "custom.ts": [
      'import { z } from "zod";',
      "export const ItemSchema = z.custom<{ id: string }>();",
      "export type Item = z.infer<typeof ItemSchema>;",
      "type SomeService = { run(): void };",
      "export const SomeServiceSchema = z.custom<SomeService>();",
      "export type PublicService = z.infer<typeof SomeServiceSchema>;",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /custom\.ts:2:\d+.*predicate-free z\.custom/);
  assert.match(result.stderr, /custom\.ts:2:\d+.*structural z\.custom/);
  assert.match(result.stderr, /custom\.ts:5:\d+.*predicate-free z\.custom/);
});

test("rejects predicate-free custom Schemas through named imports", async () => {
  const result = await runDetector({
    "named-custom.ts": [
      'import { custom as defineCustom } from "zod";',
      "export const ItemSchema = defineCustom<{ id: string }>();",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /named-custom\.ts:2:\d+.*predicate-free z\.custom/);
  assert.match(result.stderr, /named-custom\.ts:2:\d+.*structural z\.custom/);
});

test("accepts Schema factories, function checks, and real opaque predicates", async () => {
  const result = await runDetector({
    "valid-custom.ts": [
      'import { z } from "zod";',
      "class ExternalClient {}",
      "export const ExternalClientSchema = z.custom<ExternalClient>((value) => value instanceof ExternalClient);",
      "export type PublicClient = z.infer<typeof ExternalClientSchema>;",
      "export function createFactory<T extends z.ZodType>(schema: T) { return z.array(schema); }",
      "export const FunctionSchema = z.custom<() => void>((value) => typeof value === 'function');",
      "export type PublicFunction = z.infer<typeof FunctionSchema>;",
    ].join("\n"),
  });

  assert.equal(result.status, 0, result.stderr);
});
