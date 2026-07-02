import { describe, it, expect } from "vitest";
import { TodoManager } from "./todo.js";
import { ActionType, MessageType } from "../core/types.js";
import type { Action } from "../core/types.js";

function getActionMessage(action: Action) {
    if ("message" in action) return action.message;
    throw new Error("Action has no message");
}

function getActionContent(actions: Action[]): string {
    return getActionMessage(actions[0]!).content as string;
}

describe("TodoManager", () => {
    describe("getTools", () => {
        it("returns three tools", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            expect(tools).toHaveLength(3);
            const names = tools.map((t) => t.name).sort();
            expect(names).toEqual(["todo_create", "todo_delete", "todo_update"]);
        });

        it("each tool has name, description, parameters and execute", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            for (const tool of tools) {
                expect(tool.name).toBeTruthy();
                expect(tool.description).toBeTruthy();
                expect(tool.parameters).toBeDefined();
                expect(typeof tool.execute).toBe("function");
            }
        });
    });

    describe("todo_create", () => {
        it("creates a pending todo and returns confirmation", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;

            const result = await create.execute({ content: "Write tests" });
            expect(result).toBe("Created todo [pending]: Write tests");

            const actions = await mgr.process([]);
            expect(actions).toHaveLength(1);
            const content = getActionContent(actions);
            expect(content).toContain("Write tests");
            expect(content).toContain("[pending]");
        });

        it("creates multiple todos", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;

            await create.execute({ content: "Task A" });
            await create.execute({ content: "Task B" });

            const content = getActionContent(await mgr.process([]));
            expect(content).toContain("Task A");
            expect(content).toContain("Task B");
        });
    });

    describe("todo_update", () => {
        it("updates status", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;
            const update = tools.find((t) => t.name === "todo_update")!;

            await create.execute({ content: "Do something" });

            const beforeContent = getActionContent(await mgr.process([]));
            expect(beforeContent).toContain("[pending]");

            const id = extractId(beforeContent);
            const result = await update.execute({ id, status: "in_progress" });
            expect(result).toBe("Updated todo [in_progress]: Do something");

            const afterContent = getActionContent(await mgr.process([]));
            expect(afterContent).toContain("[in_progress]");
        });

        it("updates content", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;
            const update = tools.find((t) => t.name === "todo_update")!;

            await create.execute({ content: "Old" });
            const id = extractId(getActionContent(await mgr.process([])));

            const result = await update.execute({ id, content: "New" });
            expect(result).toBe("Updated todo [pending]: New");
        });

        it("updates both content and status", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;
            const update = tools.find((t) => t.name === "todo_update")!;

            await create.execute({ content: "Init" });
            const id = extractId(getActionContent(await mgr.process([])));

            const result = await update.execute({ id, content: "Done", status: "completed" });
            expect(result).toBe("Updated todo [completed]: Done");
        });

        it("returns error for non-existent id", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const update = tools.find((t) => t.name === "todo_update")!;

            const result = await update.execute({ id: "no-such-id", status: "completed" });
            expect(result).toBe("Todo not found: no-such-id");
        });
    });

    describe("todo_delete", () => {
        it("deletes a todo", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;
            const del = tools.find((t) => t.name === "todo_delete")!;

            await create.execute({ content: "Remove me" });
            const id = extractId(getActionContent(await mgr.process([])));

            const result = await del.execute({ id });
            expect(result).toBe("Deleted todo: Remove me");

            const actions = await mgr.process([]);
            expect(actions).toHaveLength(0);
        });

        it("returns error for non-existent id", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const del = tools.find((t) => t.name === "todo_delete")!;

            const result = await del.execute({ id: "ghost" });
            expect(result).toBe("Todo not found: ghost");
        });

        it("deleting one does not affect others", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;
            const del = tools.find((t) => t.name === "todo_delete")!;

            await create.execute({ content: "Keep" });
            await create.execute({ content: "Remove" });

            const beforeContent = getActionContent(await mgr.process([]));
            const removeLine = beforeContent.split("\n").find((l) => l.includes("Remove"))!;
            const id = extractId(removeLine);

            await del.execute({ id });

            const afterContent = getActionContent(await mgr.process([]));
            expect(afterContent).toContain("Keep");
            expect(afterContent).not.toContain("Remove");
        });
    });

    describe("process (ContextProcessor)", () => {
        it("returns empty actions when no todos exist", async () => {
            const mgr = new TodoManager();
            const actions = await mgr.process([]);
            expect(actions).toEqual([]);
        });

        it("exposes todo snapshots for UI consumers", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;
            const update = tools.find((t) => t.name === "todo_update")!;

            await create.execute({ content: "Plan UI" });
            const id = mgr.listTodos()[0]!.id;
            await update.execute({ id, status: "in_progress" });

            expect(mgr.listTodos()).toEqual([{
                id,
                content: "Plan UI",
                status: "in_progress",
            }]);
            mgr.clearTodos();
            expect(mgr.listTodos()).toEqual([]);
        });

        it("returns AddLast action with system message", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;

            await create.execute({ content: "Item A" });

            const actions = await mgr.process([]);
            expect(actions).toHaveLength(1);
            expect(actions[0]!.type).toBe(ActionType.AddLast);
            expect(getActionMessage(actions[0]!).type).toBe(MessageType.System);
        });

        it("formats multiple todos with numbering", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;

            await create.execute({ content: "First" });
            await create.execute({ content: "Second" });

            const content = getActionContent(await mgr.process([]));
            expect(content).toContain("1. [pending] First");
            expect(content).toContain("2. [pending] Second");
        });

        it("reflects mixed statuses", async () => {
            const mgr = new TodoManager();
            const tools = await mgr.getTools();
            const create = tools.find((t) => t.name === "todo_create")!;
            const update = tools.find((t) => t.name === "todo_update")!;

            await create.execute({ content: "A" });
            await create.execute({ content: "B" });

            const lines = getActionContent(await mgr.process([])).split("\n");
            const idA = extractId(lines.find((l) => l.includes("A"))!);

            await update.execute({ id: idA, status: "completed" });

            const content = getActionContent(await mgr.process([]));
            expect(content).toContain("[completed] A");
            expect(content).toContain("[pending] B");
        });
    });

    describe("priority", () => {
        it("has default priority 100", () => {
            const mgr = new TodoManager();
            expect(mgr.priority).toBe(100);
        });
    });
});

function extractId(text: string): string {
    const match = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
    return match?.[0] ?? "";
}
