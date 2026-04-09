import type { Message } from "./types.js";
import type { FileStore } from "./file-store.js";

export class MessageSource {
  private store: FileStore;
  private filePath: string;
  private cacheSize: number;

  private cache: Message[] = [];
  private cacheStartIndex = 0;
  private historical: Message[] | null = null;
  private initialized = false;
  private discardBeforeMessageId: string | null = null;

  constructor(store: FileStore, filePath: string, cacheSize = 100) {
    this.store = store;
    this.filePath = filePath;
    this.cacheSize = cacheSize;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const content = await this.store.readFile(this.filePath);
      if (!content.trim()) return;
      const lines = content.trim().split("\n");
      const allMessages = lines.map((line) => JSON.parse(line) as Message);

      if (allMessages.length <= this.cacheSize) {
        this.cache = allMessages;
        this.cacheStartIndex = 0;
      } else {
        const start = allMessages.length - this.cacheSize;
        this.historical = allMessages.slice(0, start);
        this.cache = allMessages.slice(start);
        this.cacheStartIndex = start;
      }
    } catch {
      // file not found, start empty
    }
  }

  async add(message: Message): Promise<void> {
    await this.ensureInitialized();
    const line = JSON.stringify(message) + "\n";
    await this.store.appendFile(this.filePath, line);
    this.pushToCache(message);
  }

  async append(messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    await this.ensureInitialized();
    const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
    await this.store.appendFile(this.filePath, lines);
    for (const msg of messages) {
      this.pushToCache(msg);
    }
  }

  private pushToCache(message: Message): void {
    if (this.cache.length >= this.cacheSize && this.cache.length > 0) {
      const evicted = this.cache.shift()!;
      this.cacheStartIndex++;
      if (this.historical !== null) {
        this.historical.push(evicted);
      }
    }
    this.cache.push(message);
  }

  setDiscardBefore(messageId: string): void {
    this.discardBeforeMessageId = messageId;
  }

  clearDiscardBefore(): void {
    this.discardBeforeMessageId = null;
  }

  async get(id: string): Promise<Message | undefined> {
    const all = await this.getAll();
    return all.find((m) => m.id === id);
  }

  async getAll(): Promise<Message[]> {
    await this.ensureInitialized();

    if (this.discardBeforeMessageId !== null) {
      const discardInCache = this.cache.findIndex((m) => m.id === this.discardBeforeMessageId);
      if (discardInCache !== -1) {
        return this.cache.slice(discardInCache + 1);
      }
    }

    if (this.cacheStartIndex === 0) {
      return this.applyDiscard([...this.cache]);
    }

    if (this.historical === null) {
      await this.loadHistorical();
    }
    return this.applyDiscard([...this.historical!, ...this.cache]);
  }

  private async loadHistorical(): Promise<void> {
    const content = await this.store.readFile(this.filePath);
    const lines = content.trim().split("\n");
    const allMessages = lines.map((line) => JSON.parse(line) as Message);
    this.historical = allMessages.slice(0, this.cacheStartIndex);
  }

  private applyDiscard(messages: Message[]): Message[] {
    if (this.discardBeforeMessageId === null) {
      return messages;
    }
    const index = messages.findIndex((m) => m.id === this.discardBeforeMessageId);
    if (index === -1) {
      return messages;
    }
    return messages.slice(index + 1);
  }
}
