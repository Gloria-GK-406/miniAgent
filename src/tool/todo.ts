import { z } from "zod";
import type { Tool, ToolProvider } from "./types.js";
import type { ContextProcessor, Action, Message } from "../core/types.js";
import { ActionType, MessageType } from "../core/types.js";
import { isCapabilityEnabled } from "../core/capability.js";
import type { AgentCapabilitySelector } from "../core/capability.js";

interface TodoItem {
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed";
}

export class TodoManager implements ToolProvider, ContextProcessor {
    priority = 100;
    private todos: TodoItem[] = [];
    private capabilities: AgentCapabilitySelector = {};

    async consumeAgentCapabilities(capabilities: AgentCapabilitySelector): Promise<void> {
        this.capabilities = capabilities;
    }

    async getTools(): Promise<Tool[]> {
        return [
            {
                name: "todo_create",
                description: "Create a new todo item",
                parameters: z.object({
                    content: z.string().describe("Description of the todo item"),
                }),
                execute: async (args: Record<string, unknown>, _signal?: AbortSignal): Promise<string> => {
                    const parsed = z.object({ content: z.string() }).parse(args);
                    const item: TodoItem = {
                        id: crypto.randomUUID(),
                        content: parsed.content,
                        status: "pending",
                    };
                    this.todos.push(item);
                    return `Created todo [${item.status}]: ${item.content}`;
                },
            },
            {
                name: "todo_update",
                description: "Update a todo item's content or status",
                parameters: z.object({
                    id: z.string().describe("ID of the todo item"),
                    content: z.string().optional().describe("New description"),
                    status: z.enum(["pending", "in_progress", "completed"]).optional().describe("New status"),
                }),
                execute: async (args: Record<string, unknown>, _signal?: AbortSignal): Promise<string> => {
                    const parsed = z.object({
                        id: z.string(),
                        content: z.string().optional(),
                        status: z.enum(["pending", "in_progress", "completed"]).optional(),
                    }).parse(args);
                    const item = this.todos.find((t) => t.id === parsed.id);
                    if (!item) return `Todo not found: ${parsed.id}`;
                    if (parsed.content !== undefined) item.content = parsed.content;
                    if (parsed.status !== undefined) item.status = parsed.status;
                    return `Updated todo [${item.status}]: ${item.content}`;
                },
            },
            {
                name: "todo_delete",
                description: "Delete a todo item by ID",
                parameters: z.object({
                    id: z.string().describe("ID of the todo item to delete"),
                }),
                execute: async (args: Record<string, unknown>, _signal?: AbortSignal): Promise<string> => {
                    const parsed = z.object({ id: z.string() }).parse(args);
                    const index = this.todos.findIndex((t) => t.id === parsed.id);
                    if (index === -1) return `Todo not found: ${parsed.id}`;
                    const removed = this.todos.splice(index, 1)[0]!;
                    return `Deleted todo: ${removed.content}`;
                },
            },
        ].filter((tool) => isCapabilityEnabled(tool.name, this.capabilities.tool));
    }

    async process(_messages: Message[]): Promise<Action[]> {
        if (this.todos.length === 0) return [];

        const lines = this.todos.map(
            (t, i) => `${i + 1}. [${t.status}] ${t.content} (id: ${t.id})`,
        );

        return [
            {
                type: ActionType.AddLast,
                message: {
                    id: crypto.randomUUID(),
                    type: MessageType.System,
                    content: `## Todo List\n${lines.join("\n")}`,
                },
            },
        ];
    }
}
