import { z } from "zod";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { FileStore as FileStoreImpl } from "../extensions/index.js";

export const SessionMetaSchema = z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    messageCount: z.number().int().nonnegative(),
    model: z.string().optional(),
});

export type SessionMeta = z.infer<typeof SessionMetaSchema>;

const SESSIONS_INDEX = "sessions.json";

export class SessionManager {
    private baseDir: string;
    private store: FileStoreImpl;
    private sessions: Map<string, SessionMeta> = new Map();
    private activeSessionId: string | null = null;

    constructor(baseDir: string) {
        this.baseDir = baseDir;
        this.store = new FileStoreImpl(baseDir);
    }

    async init(): Promise<void> {
        await this.store.writeFile(SESSIONS_INDEX, "[]");
        this.sessions.clear();
    }

    async load(): Promise<void> {
        try {
            const data = await this.store.readJsonFrom<SessionMeta[]>(SESSIONS_INDEX);
            this.sessions.clear();
            for (const s of data) {
                this.sessions.set(s.id, s);
            }
        } catch {
            await this.init();
        }
    }

    async save(): Promise<void> {
        const data = [...this.sessions.values()];
        await this.store.writeJsonTo(SESSIONS_INDEX, data);
    }

    async create(name?: string): Promise<SessionMeta> {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const meta: SessionMeta = {
            id,
            name: name ?? `session-${this.sessions.size + 1}`,
            createdAt: now,
            updatedAt: now,
            messageCount: 0,
        };
        this.sessions.set(id, meta);
        await this.save();
        await this.ensureSessionDir(id);
        return meta;
    }

    async delete(id: string): Promise<boolean> {
        if (!this.sessions.has(id)) return false;
        if (this.activeSessionId === id) {
            this.activeSessionId = null;
        }
        this.sessions.delete(id);
        await this.save();
        try {
            const dir = this.getSessionDir(id);
            await fs.rm(dir, { recursive: true, force: true });
        } catch {
            void 0;
        }
        return true;
    }

    list(): SessionMeta[] {
        return [...this.sessions.values()].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
    }

    get(id: string): SessionMeta | undefined {
        return this.sessions.get(id);
    }

    getActive(): SessionMeta | undefined {
        if (!this.activeSessionId) return undefined;
        return this.sessions.get(this.activeSessionId);
    }

    setActive(id: string): boolean {
        if (!this.sessions.has(id)) return false;
        this.activeSessionId = id;
        return true;
    }

    clearActive(): void {
        this.activeSessionId = null;
    }

    async updateMeta(id: string, updates: Partial<Pick<SessionMeta, "name" | "messageCount" | "model">>): Promise<boolean> {
        const meta = this.sessions.get(id);
        if (!meta) return false;
        Object.assign(meta, updates, { updatedAt: new Date().toISOString() });
        await this.save();
        return true;
    }

    getSessionDir(id: string): string {
        return join(this.baseDir, "sessions", id);
    }

    getSessionPersistDir(id: string): string {
        return join(this.getSessionDir(id), "data");
    }

    private async ensureSessionDir(id: string): Promise<void> {
        const dir = this.getSessionPersistDir(id);
        if (!existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true });
        }
    }
}
