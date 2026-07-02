import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SessionManager, SessionMetaSchema, type SessionMeta } from "../../core/session.js";
import { MessageSchema, type Message } from "../../core/types.js";
import { CLIAGENT_DIR } from "../config.js";

const MESSAGE_FILE = "messages.jsonl";

export interface CLISessionService {
  ensureActiveSession(): Promise<SessionMeta>;
  getActiveSession(): SessionMeta;
  getSession(id: string): SessionMeta;
  listSessions(): SessionMeta[];
  createSession(name?: string): Promise<SessionMeta>;
  switchSession(id: string): Promise<SessionMeta>;
  renameSession(id: string, name: string): Promise<SessionMeta>;
  deleteSession(id: string): Promise<void>;
  forkSession(id: string, name?: string): Promise<SessionMeta>;
  getSessionPersistDir(id: string): string;
  readMessages(id: string): Promise<Message[]>;
  writeMessages(id: string, messages: Message[]): Promise<void>;
}

function parseMessagesJsonl(content: string): Message[] {
  if (content.trim().length === 0) {
    return [];
  }
  return content
    .trim()
    .split("\n")
    .map((line) => MessageSchema.parse(JSON.parse(line) as unknown));
}

function serializeMessagesJsonl(messages: Message[]): string {
  if (messages.length === 0) {
    return "";
  }
  return `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`;
}

function requireNonEmptyName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Session name cannot be empty");
  }
  return trimmed;
}

function optionalMetaUpdates(meta: SessionMeta): Partial<Pick<SessionMeta, "messageCount" | "model">> {
  return {
    messageCount: meta.messageCount,
    ...(meta.model !== undefined && { model: meta.model }),
  };
}

export async function createCLISessionService(baseDir: string): Promise<CLISessionService> {
  const manager = new SessionManager(join(baseDir, CLIAGENT_DIR));
  await manager.load();

  function parseMeta(meta: SessionMeta): SessionMeta {
    return SessionMetaSchema.parse(meta);
  }

  function getSession(id: string): SessionMeta {
    const session = manager.get(id);
    if (session === undefined) {
      throw new Error(`Session not found: ${id}`);
    }
    return parseMeta(session);
  }

  function getActiveSession(): SessionMeta {
    const active = manager.getActive();
    if (active === undefined) {
      throw new Error("No active session");
    }
    return parseMeta(active);
  }

  async function ensureActiveSession(): Promise<SessionMeta> {
    const active = manager.getActive();
    if (active !== undefined) {
      return parseMeta(active);
    }

    const existing = manager.list()[0];
    if (existing !== undefined) {
      manager.setActive(existing.id);
      return parseMeta(existing);
    }

    const created = await manager.create("default");
    manager.setActive(created.id);
    return parseMeta(created);
  }

  function getSessionPersistDir(id: string): string {
    getSession(id);
    return manager.getSessionPersistDir(id);
  }

  async function readMessages(id: string): Promise<Message[]> {
    const filePath = join(getSessionPersistDir(id), MESSAGE_FILE);
    try {
      return parseMessagesJsonl(await readFile(filePath, "utf-8"));
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function writeMessages(id: string, messages: Message[]): Promise<void> {
    const persistDir = getSessionPersistDir(id);
    await mkdir(persistDir, { recursive: true });
    await writeFile(join(persistDir, MESSAGE_FILE), serializeMessagesJsonl(messages), "utf-8");
    await manager.updateMeta(id, { messageCount: messages.length });
  }

  async function createSession(name?: string): Promise<SessionMeta> {
    const created = await manager.create(name === undefined ? undefined : requireNonEmptyName(name));
    manager.setActive(created.id);
    return parseMeta(created);
  }

  async function switchSession(id: string): Promise<SessionMeta> {
    if (!manager.setActive(id)) {
      throw new Error(`Session not found: ${id}`);
    }
    return getActiveSession();
  }

  async function renameSession(id: string, name: string): Promise<SessionMeta> {
    getSession(id);
    await manager.updateMeta(id, { name: requireNonEmptyName(name) });
    return getSession(id);
  }

  async function deleteSession(id: string): Promise<void> {
    getSession(id);
    if (manager.list().length <= 1) {
      throw new Error("Cannot delete the last session");
    }
    const wasActive = manager.getActive()?.id === id;
    await manager.delete(id);
    if (wasActive) {
      const next = manager.list()[0];
      if (next !== undefined) {
        manager.setActive(next.id);
      }
    }
  }

  async function forkSession(id: string, name?: string): Promise<SessionMeta> {
    const source = getSession(id);
    const forkName = name === undefined ? `${source.name} copy` : requireNonEmptyName(name);
    const fork = await manager.create(forkName);
    const sourcePersistDir = manager.getSessionPersistDir(source.id);
    const forkPersistDir = manager.getSessionPersistDir(fork.id);
    await cp(sourcePersistDir, forkPersistDir, { recursive: true, force: true });
    await manager.updateMeta(fork.id, optionalMetaUpdates(source));
    return getSession(fork.id);
  }

  return {
    ensureActiveSession,
    getActiveSession,
    getSession,
    listSessions: () => manager.list().map(parseMeta),
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    forkSession,
    getSessionPersistDir,
    readMessages,
    writeMessages,
  };
}
