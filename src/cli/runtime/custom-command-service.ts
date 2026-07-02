import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { CLIAgentModeSchema } from "../config.js";
import type { CLICommand } from "./types.js";

const CustomCommandFrontmatterSchema = z.object({
  description: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  usage: z.string().optional(),
  hidden: z.boolean().optional(),
  agent: CLIAgentModeSchema.optional(),
  model: z.string().optional(),
}).passthrough();

interface ParsedCommandFile {
  frontmatter: z.infer<typeof CustomCommandFrontmatterSchema>;
  body: string;
}

function commandNameFromFile(path: string): string {
  const name = basename(path, ".md");
  if (name.trim().length === 0 || /\s/.test(name)) {
    throw new Error(`Invalid custom command name: ${name}`);
  }
  return name;
}

function parseCommandFile(content: string): ParsedCommandFile {
  if (!content.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: content.trim(),
    };
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error("Custom command frontmatter is not closed");
  }

  const frontmatterText = content.slice(4, end);
  const body = content.slice(end + "\n---".length).trim();
  return {
    frontmatter: CustomCommandFrontmatterSchema.parse(YAML.parse(frontmatterText) ?? {}),
    body,
  };
}

function renderCommandBody(body: string, args: string): string {
  return body.replaceAll("{{args}}", args).replaceAll("$ARGUMENTS", args);
}

export async function loadCustomCommands(baseDir: string): Promise<CLICommand[]> {
  const commandDir = join(baseDir, ".cliagent", "commands");
  let entries: string[];
  try {
    entries = await readdir(commandDir);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const commands: CLICommand[] = [];
  for (const entry of entries.filter((value) => value.endsWith(".md")).sort()) {
    const name = commandNameFromFile(entry);
    const parsed = parseCommandFile(await readFile(join(commandDir, entry), "utf-8"));
    commands.push({
      name,
      ...(parsed.frontmatter.aliases !== undefined && { aliases: parsed.frontmatter.aliases }),
      description: parsed.frontmatter.description ?? `Custom command: ${name}`,
      usage: parsed.frontmatter.usage ?? `/${name} [args]`,
      ...(parsed.frontmatter.hidden !== undefined && { hidden: parsed.frontmatter.hidden }),
      execute: async (ctx, args) => {
        const input = renderCommandBody(parsed.body, args.trim());
        if (parsed.frontmatter.agent !== undefined || parsed.frontmatter.model !== undefined) {
          await ctx.runtime.submitInputWithOverrides(input, {
            ...(parsed.frontmatter.agent !== undefined && { mode: parsed.frontmatter.agent }),
            ...(parsed.frontmatter.model !== undefined && { model: parsed.frontmatter.model }),
          });
          return;
        }
        await ctx.runtime.submitInput(input);
      },
    });
  }
  return commands;
}
