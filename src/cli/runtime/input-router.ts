import type { CommandRegistry } from "./command-registry.js";
import type { ReferenceService, ResolvedReference } from "./reference-service.js";
import type { ShellService } from "./shell-service.js";
import type { CLICommandContext } from "./types.js";

export type RoutedInputResult =
  | { type: "command" }
  | { type: "shell"; content: string }
  | { type: "prompt"; content: string };

export interface InputRouterDeps {
  commandRegistry: Pick<CommandRegistry, "execute">;
  shellService: Pick<ShellService, "execute">;
  referenceService: Pick<ReferenceService, "resolveReferences">;
  cwd?: string;
}

export interface InputRouter {
  route(ctx: CLICommandContext, input: string): Promise<RoutedInputResult>;
}

function formatReferenceRange(ref: ResolvedReference): string {
  if (ref.startLine === undefined) {
    return "";
  }
  const endLine = ref.endLine ?? ref.startLine;
  return `:${ref.startLine}${endLine !== ref.startLine ? `-${endLine}` : ""}`;
}

function renderReferences(references: ResolvedReference[]): string {
  if (references.length === 0) {
    return "";
  }
  const blocks = references.flatMap((ref) => [
    `File: ${ref.displayPath}${formatReferenceRange(ref)}`,
    "```",
    ref.content,
    "```",
  ]);
  return ["", "", "[Referenced files]", ...blocks].join("\n");
}

export function createInputRouter(deps: InputRouterDeps): InputRouter {
  return {
    route: async (ctx, input): Promise<RoutedInputResult> => {
      const trimmed = input.trim();
      if (trimmed.startsWith("/")) {
        await deps.commandRegistry.execute(ctx, trimmed);
        return { type: "command" };
      }
      if (trimmed.startsWith("!")) {
        const result = await deps.shellService.execute({
          command: trimmed.slice(1).trim(),
          ...(deps.cwd !== undefined && { cwd: deps.cwd }),
        });
        const content = [result.stdout, result.stderr]
          .filter((part) => part.trim().length > 0)
          .join("\n");
        return { type: "shell", content: content || "[No output]" };
      }
      const references = await deps.referenceService.resolveReferences(input);
      return {
        type: "prompt",
        content: `${input}${renderReferences(references)}`,
      };
    },
  };
}
