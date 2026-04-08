import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileStore } from "./file-store.js";

describe("FileStore", () => {
    let testDir: string;
    let store: FileStore;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "filestore-test-"));
        store = new FileStore(testDir);
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("writeFile / readFile", () => {
        it("writes and reads a file", async () => {
            await store.writeFile("a.txt", "hello");
            expect(await store.readFile("a.txt")).toBe("hello");
        });

        it("creates parent directories automatically", async () => {
            await store.writeFile("sub/dir/a.txt", "deep");
            expect(await store.readFile("sub/dir/a.txt")).toBe("deep");
        });

        it("overwrites existing file", async () => {
            await store.writeFile("b.txt", "first");
            await store.writeFile("b.txt", "second");
            expect(await store.readFile("b.txt")).toBe("second");
        });

        it("throws when reading non-existent file", async () => {
            await expect(store.readFile("nope.txt")).rejects.toThrow();
        });

        it("rejects absolute paths on write", async () => {
            await expect(store.writeFile("/absolute/path.txt", "x")).rejects.toThrow("absolute");
        });

        it("rejects absolute paths on read", async () => {
            await expect(store.readFile("/absolute/path.txt")).rejects.toThrow("absolute");
        });
    });

    describe("writeJsonTo / readJsonFrom", () => {
        it("writes and reads JSON", async () => {
            const data = { name: "test", count: 42, nested: { a: true } };
            await store.writeJsonTo("data.json", data);
            expect(await store.readJsonFrom<typeof data>("data.json")).toEqual(data);
        });

        it("writes and reads an array", async () => {
            const data = [1, "two", { three: 3 }];
            await store.writeJsonTo("arr.json", data);
            expect(await store.readJsonFrom<typeof data>("arr.json")).toEqual(data);
        });
    });

    describe("appendFile", () => {
        it("appends to a new file", async () => {
            await store.appendFile("log.txt", "line1\n");
            expect(await store.readFile("log.txt")).toBe("line1\n");
        });

        it("appends to existing file", async () => {
            await store.appendFile("log.txt", "line1\n");
            await store.appendFile("log.txt", "line2\n");
            expect(await store.readFile("log.txt")).toBe("line1\nline2\n");
        });

        it("creates parent directories", async () => {
            await store.appendFile("logs/a/log.txt", "entry\n");
            expect(await store.readFile("logs/a/log.txt")).toBe("entry\n");
        });

        it("appends multiple times", async () => {
            for (let i = 0; i < 5; i++) {
                await store.appendFile("seq.txt", `${i}\n`);
            }
            const content = await store.readFile("seq.txt");
            expect(content).toBe("0\n1\n2\n3\n4\n");
        });

        it("rejects absolute paths", async () => {
            await expect(store.appendFile("/abs/path.txt", "x")).rejects.toThrow("absolute");
        });
    });
});
