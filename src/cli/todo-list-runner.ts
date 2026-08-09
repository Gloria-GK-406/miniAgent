import type { TodoItemSnapshot } from "../extensions/index.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export type TodoListOutput = "text" | "json";

export function filterTodos(todos: TodoItemSnapshot[], query: string | undefined): TodoItemSnapshot[] {
  const normalized = query?.trim().toLowerCase() ?? "";
  if (normalized.length === 0) {
    return todos;
  }
  return todos.filter((todo) =>
    todo.id.toLowerCase().includes(normalized) ||
    todo.content.toLowerCase().includes(normalized) ||
    todo.status.toLowerCase().includes(normalized));
}

export function formatTodoList(todos: TodoItemSnapshot[], query?: string): string {
  if (todos.length === 0) {
    return query === undefined
      ? "No todos\n"
      : `No todos matching "${query}"\n`;
  }
  const title = query === undefined
    ? `Todos (${todos.length})`
    : `Todos matching "${query}" (${todos.length})`;
  return `${[
    title,
    ...todos.map((todo) => `${todo.status.toUpperCase()} ${todo.id} ${todo.content}`),
  ].join("\n")}\n`;
}

export function formatTodoListJson(todos: TodoItemSnapshot[], query?: string): string {
  return `${JSON.stringify({
    ok: true,
    ...(query !== undefined && { query }),
    todos,
  }, null, 2)}\n`;
}

export async function runTodoList(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { query?: string; output?: TodoListOutput } = {},
): Promise<number> {
  const output = options.output ?? "text";
  try {
    const todos = filterTodos(runtime.listTodos(), options.query);
    streams.stdout(
      output === "json"
        ? formatTodoListJson(todos, options.query)
        : formatTodoList(todos, options.query),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}
