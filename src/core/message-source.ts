import type { Message } from "./types.js";

/**
 * MessageSource 维护一条有序消息序列，支持按 discardBeforeMessageId 逻辑截断。
 *
 * 丢弃水位线（discardBeforeMessageId）之前的消息被视为不存在：
 * - getAll() 不会返回它们
 * - get(id) 对它们的查询结果为 undefined
 * - 但这些消息仍在内存中保留，可通过调整水位线重新访问
 */
export class MessageSource {
  private messages: Message[] = [];
  private discardBeforeMessageId: string | null = null;

  add(message: Message): void {
    this.messages.push(message);
  }

  append(messages: Message[]): void {
    this.messages.push(...messages);
  }

  setDiscardBefore(messageId: string): void {
    this.discardBeforeMessageId = messageId;
  }

  /**
   * 获取指定 id 的消息。
   * 如果该消息位于 discardBeforeMessageId 之前（含），视为不存在，返回 undefined。
   */
  get(id: string): Message | undefined {
    const message = this.messages.find((m) => m.id === id);
    if (!message) {
      return undefined;
    }
    if (this.discardBeforeMessageId !== null && !this.isAfterDiscard(message)) {
      return undefined;
    }
    return message;
  }

  /**
   * 获取当前有效的全部消息（丢弃水位线之前的消息视为不存在，不会返回）。
   */
  getAll(): Message[] {
    if (this.discardBeforeMessageId === null) {
      return [...this.messages];
    }
    const index = this.messages.findIndex((m) => m.id === this.discardBeforeMessageId);
    if (index === -1) {
      return [...this.messages];
    }
    return this.messages.slice(index + 1);
  }

  private isAfterDiscard(message: Message): boolean {
    if (this.discardBeforeMessageId === null) {
      return true;
    }
    const discardIndex = this.messages.findIndex((m) => m.id === this.discardBeforeMessageId);
    if (discardIndex === -1) {
      return true;
    }
    const messageIndex = this.messages.findIndex((m) => m.id === message.id);
    return messageIndex > discardIndex;
  }
}
