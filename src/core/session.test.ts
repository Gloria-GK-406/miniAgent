import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { SessionManager } from "./session.js";

describe("SessionManager", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "miniagent-session-test-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("creates a session with default name", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();

        const session = await manager.create();
        expect(session.name).toBe("session-1");
        expect(session.id).toBeTruthy();
        expect(session.messageCount).toBe(0);
    });

    it("creates a session with custom name", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();

        const session = await manager.create("my-session");
        expect(session.name).toBe("my-session");
    });

    it("lists sessions sorted by updatedAt desc", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();

        const s1 = await manager.create("first");
        const s2 = await manager.create("second");

        const list = manager.list();
        expect(list.length).toBe(2);
        expect(list[0]!.id).toBe(s2.id);
        expect(list[1]!.id).toBe(s1.id);
    });

    it("sets and gets active session", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();

        const session = await manager.create();
        const result = manager.setActive(session.id);
        expect(result).toBe(true);

        const active = manager.getActive();
        expect(active?.id).toBe(session.id);
    });

    it("setActive returns false for unknown id", () => {
        const manager = new SessionManager(testDir);
        const result = manager.setActive("nonexistent");
        expect(result).toBe(false);
    });

    it("deletes a session", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();

        const s1 = await manager.create("keep");
        const s2 = await manager.create("delete");

        const result = await manager.delete(s2.id);
        expect(result).toBe(true);
        expect(manager.list().length).toBe(1);
        expect(manager.list()[0]!.id).toBe(s1.id);
    });

    it("delete returns false for unknown id", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();

        const result = await manager.delete("nonexistent");
        expect(result).toBe(false);
    });

    it("updates session metadata", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();

        const session = await manager.create();
        await manager.updateMeta(session.id, { name: "renamed", messageCount: 5 });

        const updated = manager.get(session.id);
        expect(updated?.name).toBe("renamed");
        expect(updated?.messageCount).toBe(5);
    });

    it("persists sessions across load calls", async () => {
        const manager1 = new SessionManager(testDir);
        await manager1.load();
        const session = await manager1.create("persistent");

        const manager2 = new SessionManager(testDir);
        await manager2.load();

        const list = manager2.list();
        expect(list.length).toBe(1);
        expect(list[0]!.name).toBe("persistent");
        expect(list[0]!.id).toBe(session.id);
    });

    it("creates session directory", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();
        const session = await manager.create();

        const persistDir = manager.getSessionPersistDir(session.id);
        expect(existsSync(persistDir)).toBe(true);
    });

    it("clears active session", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();
        const session = await manager.create();
        manager.setActive(session.id);

        manager.clearActive();
        expect(manager.getActive()).toBeUndefined();
    });

    it("deleting active session clears it", async () => {
        const manager = new SessionManager(testDir);
        await manager.load();
        await manager.create("first");
        const s2 = await manager.create("second");
        manager.setActive(s2.id);

        await manager.delete(s2.id);
        expect(manager.getActive()).toBeUndefined();
    });
});
