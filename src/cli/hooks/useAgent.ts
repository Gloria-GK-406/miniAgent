import { useState, useEffect, useCallback } from "react";
import type { Message, TokenCount } from "../../core/types.js";
import { MessageType } from "../../core/types.js";

interface AgentLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  removeAllListeners(event?: string): unknown;
  run(input: Message): Promise<Message[]>;
  getMessages(): Promise<Message[]>;
  getContextCount(): TokenCount;
}

export interface UseAgentReturn {
  messages: Message[];
  isRunning: boolean;
  streamingText: string;
  reasoningText: string;
  currentTool: string | null;
  error: string | null;
  turnCount: number;
  tokenUsage: TokenCount;
  sendMessage: (text: string) => Promise<void>;
}

export function useAgent(agent: AgentLike): UseAgentReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [reasoningText, setReasoningText] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [tokenUsage, setTokenUsage] = useState<TokenCount>({
    input: 0,
    output: 0,
    total: 0,
  });

  useEffect(() => {
    let cancelled = false;
    agent.getMessages().then((loaded) => {
      if (!cancelled) {
        setMessages((prev) => (prev.length === 0 ? loaded : prev));
      }
    });
    return () => { cancelled = true; };
  }, [agent]);

  useEffect(() => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};

    handlers["run:start"] = () => {
      setIsRunning(true);
      setError(null);
    };

    handlers["run:complete"] = (payload: unknown) => {
      const p = payload as { messages: Message[] };
      setIsRunning(false);
      setMessages(p.messages);
      setStreamingText("");
      setReasoningText("");
    };

    handlers["run:stop"] = () => {
      setIsRunning(false);
    };

    handlers["run:error"] = (payload: unknown) => {
      const p = payload as { error: unknown };
      const msg =
        p.error instanceof Error ? p.error.message : String(p.error);
      setError(msg);
      setIsRunning(false);
    };

    handlers["turn:start"] = (payload: unknown) => {
      const p = payload as { turn: number };
      setTurnCount(p.turn);
    };

    handlers["turn:end"] = (payload: unknown) => {
      const p = payload as { turn: number };
      setTurnCount(p.turn);
    };

    handlers["llm:chunk"] = (payload: unknown) => {
      const p = payload as {
        chunk: { type: string; text?: string };
      };
      if (p.chunk.type === "text-delta" && p.chunk.text !== undefined) {
        setStreamingText((prev) => prev + p.chunk.text);
      }
      if (
        p.chunk.type === "reasoning-delta" &&
        p.chunk.text !== undefined
      ) {
        setReasoningText((prev) => prev + p.chunk.text);
      }
    };

    handlers["llm:response"] = (payload: unknown) => {
      const p = payload as {
        response: { tokenCount: TokenCount };
      };
      setTokenUsage(p.response.tokenCount);
    };

    handlers["tool:execute"] = (payload: unknown) => {
      const p = payload as {
        toolCall: { toolName: string };
      };
      setCurrentTool(p.toolCall.toolName);
    };

    handlers["tool:result"] = () => {
      setCurrentTool(null);
    };

    handlers["message:notify"] = (payload: unknown) => {
      const p = payload as { message: Message };
      setMessages((prev) => {
        if (prev.some((message) => message.id === p.message.id)) {
          return prev;
        }
        return [...prev, p.message];
      });
    };

    for (const [event, handler] of Object.entries(handlers)) {
      agent.on(event, handler);
    }

    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        agent.off(event, handler);
      }
    };
  }, [agent]);

  const sendMessage = useCallback(
    async (text: string) => {
      const message: Message = {
        id: crypto.randomUUID(),
        type: MessageType.User,
        content: text,
      };
      setStreamingText("");
      setReasoningText("");
      await agent.run(message);
    },
    [agent],
  );

  return {
    messages,
    isRunning,
    streamingText,
    reasoningText,
    currentTool,
    error,
    turnCount,
    tokenUsage,
    sendMessage,
  };
}
