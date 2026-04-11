import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MessageType } from "./types.js";
import type { Message } from "./types.js";
import { FileStore } from "./file-store.js";
import { MessageSource } from "./message-source.js";

function userMsg(id: string, content: string): Message {
    return { id, type: MessageType.User, content };
}

describe("MessageSource", () => {
    let testDir: string;
    let store: FileStore;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "msgsrc-test-"));
        store = new FileStore(testDir);
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("add / getAll", () => {
        it("adds and retrieves a single message", async () => {
            const ms = new MessageSource(store, "test.jsonl");
            const msg = userMsg("m1", "hello");
            await ms.add(msg);
            const all = await ms.getAll();
            expect(all).toHaveLength(1);
            expect(all[0]!.id).toBe("m1");
            expect(all[0]!.content).toBe("hello");
        });

        it("adds and retrieves multiple messages in order", async () => {
            const ms = new MessageSource(store, "test.jsonl");
            await ms.add(userMsg("m1", "first"));
            await ms.add(userMsg("m2", "second"));
            await ms.add(userMsg("m3", "third"));
            const all = await ms.getAll();
            expect(all).toHaveLength(3);
            expect(all.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
        });

        it("returns empty array when no messages", async () => {
            const ms = new MessageSource(store, "test.jsonl");
            const all = await ms.getAll();
            expect(all).toEqual([]);
        });
    });

    describe("append", () => {
        it("appends multiple messages at once", async () => {
            const ms = new MessageSource(store, "test.jsonl");
            await ms.append([userMsg("m1", "a"), userMsg("m2", "b")]);
            const all = await ms.getAll();
            expect(all).toHaveLength(2);
            expect(all[0]!.id).toBe("m1");
            expect(all[1]!.id).toBe("m2");
        });

        it("append empty array does nothing", async () => {
            const ms = new MessageSource(store, "test.jsonl");
            await ms.append([]);
            const all = await ms.getAll();
            expect(all).toEqual([]);
        });

        it("append after add preserves order", async () => {
            const ms = new MessageSource(store, "test.jsonl");
            await ms.add(userMsg("m1", "first"));
            await ms.append([userMsg("m2", "second"), userMsg("m3", "third")]);
            const all = await ms.getAll();
            expect(all.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
        });
    });

    describe("get", () => {
        it("returns message by id", async () => {
            const ms = new MessageSource(store, "test.jsonl");
            await ms.add(userMsg("m1", "hello"));
            await ms.add(userMsg("m2", "world"));
            const msg = await ms.get("m1");
            expect(msg).toBeDefined();
            expect(msg!.content).toBe("hello");
        });

        it("returns undefined for unknown id", async () => {
            const ms = new MessageSource(store, "test.jsonl");
            await ms.add(userMsg("m1", "hello"));
            const msg = await ms.get("unknown");
            expect(msg).toBeUndefined();
        });
    });

    describe("persistence", () => {
        it("restores messages from file on init", async () => {
            await ms_addMessages(store, "persist.jsonl", [
                userMsg("m1", "a"),
                userMsg("m2", "b"),
            ]);

            const ms = new MessageSource(store, "persist.jsonl");
            const all = await ms.getAll();
            expect(all).toHaveLength(2);
            expect(all[0]!.id).toBe("m1");
            expect(all[1]!.id).toBe("m2");
        });

        it("appends new messages to restored state", async () => {
            await ms_addMessages(store, "persist.jsonl", [
                userMsg("m1", "old"),
            ]);

            const ms = new MessageSource(store, "persist.jsonl");
            await ms.add(userMsg("m2", "new"));
            const all = await ms.getAll();
            expect(all).toHaveLength(2);
            expect(all[0]!.id).toBe("m1");
            expect(all[1]!.id).toBe("m2");
        });
    });

    describe("cache eviction", () => {
        it("evicts oldest when cache is full", async () => {
            const ms = new MessageSource(store, "cache.jsonl", 3);
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));
            await ms.add(userMsg("m3", "c"));
            await ms.add(userMsg("m4", "d"));

            const all = await ms.getAll();
            expect(all).toHaveLength(4);
            expect(all.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
        });

        it("evicts multiple messages beyond cache size", async () => {
            const ms = new MessageSource(store, "cache.jsonl", 3);
            for (let i = 1; i <= 6; i++) {
                await ms.add(userMsg(`m${i}`, `msg${i}`));
            }

            const all = await ms.getAll();
            expect(all).toHaveLength(6);
            expect(all.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
        });

        it("lazy loads historical from file when needed", async () => {
            const ms = new MessageSource(store, "cache.jsonl", 3);
            for (let i = 1; i <= 5; i++) {
                await ms.add(userMsg(`m${i}`, `msg${i}`));
            }

            const ms2 = new MessageSource(store, "cache.jsonl", 3);
            const all = await ms2.getAll();
            expect(all).toHaveLength(5);
            expect(all.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
        });
    });

    describe("discardBefore", () => {
        it("discards messages before the specified id", async () => {
            const ms = new MessageSource(store, "discard.jsonl");
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));
            await ms.add(userMsg("m3", "c"));

            await ms.setDiscardBefore("m1");
            const all = await ms.getAll();
            expect(all.map((m) => m.id)).toEqual(["m2", "m3"]);
        });

        it("discards messages before middle id", async () => {
            const ms = new MessageSource(store, "discard.jsonl");
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));
            await ms.add(userMsg("m3", "c"));
            await ms.add(userMsg("m4", "d"));

            await ms.setDiscardBefore("m2");
            const all = await ms.getAll();
            expect(all.map((m) => m.id)).toEqual(["m3", "m4"]);
        });

        it("returns empty when discarding last message", async () => {
            const ms = new MessageSource(store, "discard.jsonl");
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));

            await ms.setDiscardBefore("m2");
            const all = await ms.getAll();
            expect(all).toEqual([]);
        });

        it("returns all when discard id not found", async () => {
            const ms = new MessageSource(store, "discard.jsonl");
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));

            await ms.setDiscardBefore("nonexistent");
            const all = await ms.getAll();
            expect(all).toHaveLength(2);
        });

        it("get returns undefined for discarded message", async () => {
            const ms = new MessageSource(store, "discard.jsonl");
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));
            await ms.add(userMsg("m3", "c"));

            await ms.setDiscardBefore("m1");
            const msg = await ms.get("m1");
            expect(msg).toBeUndefined();
        });

        it("get returns message after discard point", async () => {
            const ms = new MessageSource(store, "discard.jsonl");
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));
            await ms.add(userMsg("m3", "c"));

            await ms.setDiscardBefore("m1");
            const msg = await ms.get("m2");
            expect(msg).toBeDefined();
            expect(msg!.content).toBe("b");
        });

        it("short-circuits when discard hits cache without loading historical", async () => {
            const ms = new MessageSource(store, "discard.jsonl", 3);
            for (let i = 1; i <= 6; i++) {
                await ms.add(userMsg(`m${i}`, `msg${i}`));
            }

            const ms2 = new MessageSource(store, "discard.jsonl", 3);
            await ms2.setDiscardBefore("m5");
            const all = await ms2.getAll();
            expect(all).toHaveLength(1);
            expect(all[0]!.id).toBe("m6");
        });
    });

    describe("discardBefore persistence", () => {
        it("restores discardBeforeMessageId from meta file", async () => {
            await ms_addMessages(store, "persist-discard.jsonl", [
                userMsg("m1", "a"),
                userMsg("m2", "b"),
                userMsg("m3", "c"),
            ]);
            await store.writeJsonTo("persist-discard.jsonl.meta.json", {
                discardBeforeMessageId: "m1",
            });

            const ms = new MessageSource(store, "persist-discard.jsonl");
            const all = await ms.getAll();
            expect(all.map((m) => m.id)).toEqual(["m2", "m3"]);
        });

        it("persists discardBeforeMessageId on setDiscardBefore", async () => {
            const ms = new MessageSource(store, "persist-discard2.jsonl");
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));
            await ms.add(userMsg("m3", "c"));
            await ms.setDiscardBefore("m1");

            const ms2 = new MessageSource(store, "persist-discard2.jsonl");
            const all = await ms2.getAll();
            expect(all.map((m) => m.id)).toEqual(["m2", "m3"]);
        });

        it("persists clearDiscardBefore", async () => {
            const ms = new MessageSource(store, "persist-discard3.jsonl");
            await ms.add(userMsg("m1", "a"));
            await ms.add(userMsg("m2", "b"));
            await ms.setDiscardBefore("m1");
            await ms.clearDiscardBefore();

            const ms2 = new MessageSource(store, "persist-discard3.jsonl");
            const all = await ms2.getAll();
            expect(all.map((m) => m.id)).toEqual(["m1", "m2"]);
        });
    });
});

async function ms_addMessages(store: FileStore, filePath: string, messages: Message[]): Promise<void> {
    const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
    await store.appendFile(filePath, lines);
}
