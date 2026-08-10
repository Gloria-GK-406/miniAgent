import { z } from "zod";
import { createFunctionSchema } from "./function-schema.js";
import type { Message } from "./message.js";

export interface Store {
    readFile(path: string): Promise<string>;
    writeFile(path: string, data: string): Promise<void>;
    writeJsonTo<T>(path: string, data: T): Promise<void>;
    readJsonFrom<T>(path: string): Promise<T>;
    appendFile(path: string, data: string): Promise<void>;
}

export interface MessageSource {
    add(message: Message): Promise<void>;
    append(messages: Message[]): Promise<void>;
    setDiscardBefore(messageId: string): Promise<void>;
    clearDiscardBefore(): Promise<void>;
    get(id: string): Promise<Message | undefined>;
    getAll(): Promise<Message[]>;
}

export const PersistRequireSchema = z.object({
    setStore: createFunctionSchema<(store: Store) => Promise<void>>(),
});

export type PersistRequire = z.infer<typeof PersistRequireSchema>;

export class MemoryStore implements Store {
    private readonly files = new Map<string, string>();

    async readFile(path: string): Promise<string> {
        const value = this.files.get(path);
        if (value === undefined) {
            throw new Error(`File not found: ${path}`);
        }
        return value;
    }

    async writeFile(path: string, data: string): Promise<void> {
        this.files.set(path, data);
    }

    async writeJsonTo<T>(path: string, data: T): Promise<void> {
        await this.writeFile(path, JSON.stringify(data, null, 2));
    }

    async readJsonFrom<T>(path: string): Promise<T> {
        return JSON.parse(await this.readFile(path)) as T;
    }

    async appendFile(path: string, data: string): Promise<void> {
        this.files.set(path, (this.files.get(path) ?? "") + data);
    }
}

export class MemoryMessageSource implements MessageSource {
    private readonly messages: Message[] = [];
    private discardBeforeMessageId: string | null = null;

    async add(message: Message): Promise<void> {
        this.messages.push(message);
    }

    async append(messages: Message[]): Promise<void> {
        this.messages.push(...messages);
    }

    async setDiscardBefore(messageId: string): Promise<void> {
        this.discardBeforeMessageId = messageId;
    }

    async clearDiscardBefore(): Promise<void> {
        this.discardBeforeMessageId = null;
    }

    async get(id: string): Promise<Message | undefined> {
        return (await this.getAll()).find((message) => message.id === id);
    }

    async getAll(): Promise<Message[]> {
        if (this.discardBeforeMessageId === null) {
            return [...this.messages];
        }
        const index = this.messages.findIndex(
            (message) => message.id === this.discardBeforeMessageId,
        );
        return index === -1 ? [...this.messages] : this.messages.slice(index + 1);
    }
}
