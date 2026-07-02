import { describe, expect, it, vi } from "vitest";
import type { TodoItemSnapshot } from "../tool/todo.js";
import type { CLIAppRuntime } from "./runtime/types.js";
import {
  filterTodos,
  formatTodoList,
  formatTodoListJson,
  runTodoList,
} from "./todo-list-runner.js";

const todos: TodoItemSnapshot[] = [
  { id: "todo-1", content: "Write tests", status: "completed" },
  { id: "todo-2", content: "Render todo panel", status: "pending" },
  { id: "todo-3", content: "Ship CLI output", status: "in_progress" },
];

describe("filterTodos", () => {
  it("filters todos by id, content, or status", () => {
    expect(filterTodos(todos, "render")).toEqual([todos[1]]);
    expect(filterTodos(todos, "todo-3")).toEqual([todos[2]]);
    expect(filterTodos(todos, "completed")).toEqual([todos[0]]);
  });
});

describe("formatTodoList", () => {
  it("formats todo records for terminal output", () => {
    expect(formatTodoList(todos)).toBe([
      "Todos (3)",
      "COMPLETED todo-1 Write tests",
      "PENDING todo-2 Render todo panel",
      "IN_PROGRESS todo-3 Ship CLI output",
      "",
    ].join("\n"));
  });

  it("formats filtered and empty todo lists", () => {
    expect(formatTodoList([todos[1]!], "render")).toBe([
      "Todos matching \"render\" (1)",
      "PENDING todo-2 Render todo panel",
      "",
    ].join("\n"));
    expect(formatTodoList([], "missing")).toBe("No todos matching \"missing\"\n");
    expect(formatTodoList([])).toBe("No todos\n");
  });
});

describe("formatTodoListJson", () => {
  it("formats todos as json", () => {
    expect(formatTodoListJson(todos, "todo")).toBe(`${JSON.stringify({
      ok: true,
      query: "todo",
      todos,
    }, null, 2)}\n`);
  });
});

describe("runTodoList", () => {
  it("prints todos and destroys the runtime", async () => {
    const runtime = {
      listTodos: vi.fn(() => todos),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runTodoList(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(runtime.listTodos).toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(formatTodoList(todos));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("filters todos and prints json", async () => {
    const runtime = {
      listTodos: vi.fn(() => todos),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runTodoList(runtime, { stdout, stderr }, {
      query: "render",
      output: "json",
    })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatTodoListJson([todos[1]!], "render"));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints runtime errors as json when requested", async () => {
    const runtime = {
      listTodos: vi.fn(() => {
        throw new Error("todos unavailable");
      }),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runTodoList(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"todos unavailable\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });
});
