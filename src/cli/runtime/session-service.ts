import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SessionManager, SessionMetaSchema, type SessionMeta } from "../../core/session.js";
import { MessageSchema, TokenCountSchema, type Message, type TokenCount } from "../../core/types.js";
import { CLIAGENT_DIR, CLIAgentModeSchema, type CLIAgentMode } from "../config.js";

const MESSAGE_FILE = "messages.jsonl";
const CLI_META_FILE = "cli-meta.json";
const ACTIVE_SESSION_FILE = "active-session.json";

const EMPTY_TOKEN_USAGE: TokenCount = { input: 0, output: 0, total: 0 };
const ActiveSessionSchema = z.object({ id: z.string() }).strict();

export const CLISessionRuntimeMetadataSchema = z.object({
  version: z.literal(1),
  mode: CLIAgentModeSchema.optional(),
  tokenUsage: TokenCountSchema.default(EMPTY_TOKEN_USAGE),
}).strict();

export type CLISessionRuntimeMetadata = z.infer<typeof CLISessionRuntimeMetadataSchema>;

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
  updateSessionModel(id: string, model: string): Promise<SessionMeta>;
  readSessionRuntimeMetadata(id: string): Promise<CLISessionRuntimeMetadata>;
  updateSessionMode(id: string, mode: CLIAgentMode): Promise<CLISessionRuntimeMetadata>;
  updateSessionTokenUsage(id: string, tokenUsage: TokenCount): Promise<CLISessionRuntimeMetadata>;
  getSessionPersistDir(id: string): string;
  readMessages(id: string): Promise<Message[]>;
  writeMessages(id: string, messages: Message[]): Promise<void>;
  removeLastUserTurn(id: string): Promise<{ turnId: string; messages: Message[] }>;
  appendMessages(id: string, messages: Message[]): Promise<void>;
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

function requireNonEmptyModel(model: string): string {
  const trimmed = model.trim();
  if (trimmed.length === 0) {
    throw new Error("Session model cannot be empty");
  }
  return trimmed;
}

function findLastUserTurnIndex(messages: Message[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]!.type === "user") {
      return index;
    }
  }
  return -1;
}

function optionalMetaUpdates(meta: SessionMeta): Partial<Pick<SessionMeta, "messageCount" | "model">> {
  return {
    messageCount: meta.messageCount,
    ...(meta.model !== undefined && { model: meta.model }),
  };
}

export async function createCLISessionService(baseDir: string): Promise<CLISessionService> {
  const cliAgentDir = join(baseDir, CLIAGENT_DIR);
  const manager = new SessionManager(cliAgentDir);
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

  async function readPersistedActiveSessionId(): Promise<string | null> {
    try {
      return ActiveSessionSchema.parse(
        JSON.parse(await readFile(join(cliAgentDir, ACTIVE_SESSION_FILE), "utf-8")) as unknown,
      ).id;
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async function persistActiveSession(id: string): Promise<void> {
    getSession(id);
    await mkdir(cliAgentDir, { recursive: true });
    await writeFile(
      join(cliAgentDir, ACTIVE_SESSION_FILE),
      `${JSON.stringify({ id }, null, 2)}\n`,
      "utf-8",
    );
  }

  async function ensureActiveSession(): Promise<SessionMeta> {
    const active = manager.getActive();
    if (active !== undefined) {
      return parseMeta(active);
    }

    const persistedActiveId = await readPersistedActiveSessionId();
    if (persistedActiveId !== null && manager.setActive(persistedActiveId)) {
      return getActiveSession();
    }

    const existing = manager.list()[0];
    if (existing !== undefined) {
      manager.setActive(existing.id);
      await persistActiveSession(existing.id);
      return parseMeta(existing);
    }

    const created = await manager.create("default");
    manager.setActive(created.id);
    await persistActiveSession(created.id);
    return parseMeta(created);
  }

  function getSessionPersistDir(id: string): string {
    getSession(id);
    return manager.getSessionPersistDir(id);
  }

  function getSessionRuntimeMetadataPath(id: string): string {
    getSession(id);
    return join(manager.getSessionDir(id), CLI_META_FILE);
  }

  async function touchSession(id: string): Promise<void> {
    await manager.updateMeta(id, optionalMetaUpdates(getSession(id)));
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

  async function readSessionRuntimeMetadata(id: string): Promise<CLISessionRuntimeMetadata> {
    try {
      return CLISessionRuntimeMetadataSchema.parse(
        JSON.parse(await readFile(getSessionRuntimeMetadataPath(id), "utf-8")) as unknown,
      );
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return CLISessionRuntimeMetadataSchema.parse({ version: 1 });
      }
      throw error;
    }
  }

  async function writeSessionRuntimeMetadata(
    id: string,
    metadata: CLISessionRuntimeMetadata,
  ): Promise<CLISessionRuntimeMetadata> {
    const parsed = CLISessionRuntimeMetadataSchema.parse(metadata);
    await mkdir(manager.getSessionDir(id), { recursive: true });
    await writeFile(
      getSessionRuntimeMetadataPath(id),
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf-8",
    );
    await touchSession(id);
    return parsed;
  }

  async function updateSessionMode(id: string, mode: CLIAgentMode): Promise<CLISessionRuntimeMetadata> {
    return writeSessionRuntimeMetadata(id, {
      ...await readSessionRuntimeMetadata(id),
      mode,
    });
  }

  async function updateSessionTokenUsage(
    id: string,
    tokenUsage: TokenCount,
  ): Promise<CLISessionRuntimeMetadata> {
    return writeSessionRuntimeMetadata(id, {
      ...await readSessionRuntimeMetadata(id),
      tokenUsage,
    });
  }

  async function removeLastUserTurn(id: string): Promise<{ turnId: string; messages: Message[] }> {
    const messages = await readMessages(id);
    const index = findLastUserTurnIndex(messages);
    if (index === -1) {
      throw new Error("No user turn to undo");
    }
    const userMessage = messages[index]!;
    const removed = messages.slice(index);
    await writeMessages(id, messages.slice(0, index));
    return {
      turnId: userMessage.id,
      messages: removed,
    };
  }

  async function appendMessages(id: string, messages: Message[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    await writeMessages(id, [...await readMessages(id), ...messages]);
  }

  async function createSession(name?: string): Promise<SessionMeta> {
    const created = await manager.create(name === undefined ? undefined : requireNonEmptyName(name));
    manager.setActive(created.id);
    await persistActiveSession(created.id);
    return parseMeta(created);
  }

  async function switchSession(id: string): Promise<SessionMeta> {
    if (!manager.setActive(id)) {
      throw new Error(`Session not found: ${id}`);
    }
    await persistActiveSession(id);
    return getActiveSession();
  }

  async function renameSession(id: string, name: string): Promise<SessionMeta> {
    getSession(id);
    await manager.updateMeta(id, { name: requireNonEmptyName(name) });
    return getSession(id);
  }

  async function updateSessionModel(id: string, model: string): Promise<SessionMeta> {
    getSession(id);
    await manager.updateMeta(id, { model: requireNonEmptyModel(model) });
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
        await persistActiveSession(next.id);
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
    await writeSessionRuntimeMetadata(fork.id, await readSessionRuntimeMetadata(source.id));
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
    updateSessionModel,
    readSessionRuntimeMetadata,
    updateSessionMode,
    updateSessionTokenUsage,
    getSessionPersistDir,
    readMessages,
    writeMessages,
    removeLastUserTurn,
    appendMessages,
  };
}
