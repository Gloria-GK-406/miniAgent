import { describe, expect, it } from "vitest";
import { MemoryMessageSource, MemoryStore } from "./persistence.js";
import { MessageType, type Message } from "./message.js";

function message(id: string): Message {
    return { id, type: MessageType.User, content: id };
}

describe("core memory persistence", () => {
    it("stores and appends content without filesystem access", async () => {
        const store = new MemoryStore();

        await store.writeFile("messages", "first");
        await store.appendFile("messages", "-second");

        expect(await store.readFile("messages")).toBe("first-second");
    });

    it("applies the discard watermark consistently to list and lookup", async () => {
        const source = new MemoryMessageSource();
        await source.append([message("first"), message("second")]);

        await source.setDiscardBefore("first");

        expect(await source.getAll()).toEqual([message("second")]);
        expect(await source.get("first")).toBeUndefined();
        expect(await source.get("second")).toEqual(message("second"));
    });
});
