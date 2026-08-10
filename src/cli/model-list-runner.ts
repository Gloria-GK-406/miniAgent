import { z } from "zod";
import { LoadConfigOptionsSchema, loadConfig, parseModelSelector, type CLIConfig, type LoadConfigOptions } from "./config.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";

export const ModelListOutputSchema = z.enum(["text", "json"]);
export type ModelListOutput = z.infer<typeof ModelListOutputSchema>;

export const ModelListRequestSchema = z.intersection(z.lazy(() => LoadConfigOptionsSchema), z.object({
  baseDir: z.string(),
  output: ModelListOutputSchema.optional(),
})) as z.ZodType<LoadConfigOptions & {
  baseDir: string;
  output?: ModelListOutput;
}>;
export type ModelListRequest = z.infer<typeof ModelListRequestSchema>;

export const ConfiguredModelInfoSchema = z.object({
  selector: z.string(),
  provider: z.string(),
  id: z.string(),
  name: z.string(),
  displayName: z.string().optional(),
  default: z.boolean(),
}) as z.ZodType<{
  selector: string;
  provider: string;
  id: string;
  name: string;
  displayName?: string;
  default: boolean;
}>;
export type ConfiguredModelInfo = z.infer<typeof ConfiguredModelInfoSchema>;

function isDefaultModel(
  config: Pick<CLIConfig, "defaultModel">,
  provider: string,
  id: string,
): boolean {
  const selector = parseModelSelector(config.defaultModel);
  if (selector === undefined) {
    return false;
  }
  return selector.includes("/")
    ? selector === `${provider}/${id}`
    : selector === id;
}

export function listConfiguredModels(
  config: Pick<CLIConfig, "providers" | "defaultModel">,
): ConfiguredModelInfo[] {
  return config.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      selector: `${provider.engine}/${model.id}`,
      provider: provider.engine,
      id: model.id,
      name: model.name,
      ...(model.displayName !== undefined && { displayName: model.displayName }),
      default: isDefaultModel(config, provider.engine, model.id),
    })));
}

export function formatModelList(models: ConfiguredModelInfo[]): string {
  if (models.length === 0) {
    return "No models configured\n";
  }
  return `${models.map((model) => {
    const marker = model.default ? "*" : " ";
    return `${marker} ${model.selector} - ${model.displayName ?? model.name}`;
  }).join("\n")}\n`;
}

export function formatModelListJson(defaultModel: string, models: ConfiguredModelInfo[]): string {
  return `${JSON.stringify({
    defaultModel: defaultModel.trim().length > 0 ? defaultModel : null,
    models,
  }, null, 2)}\n`;
}

async function loadConfigForModelList(request: ModelListRequest): Promise<CLIConfig> {
  return await loadConfig(request.baseDir, {
    ...(request.env !== undefined && { env: request.env }),
    ...(request.platform !== undefined && { platform: request.platform }),
    ...(request.homeDir !== undefined && { homeDir: request.homeDir }),
    createTemplateIfMissing: false,
  });
}

export async function runModelList(
  request: ModelListRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const config = await loadConfigForModelList(request);
    const models = listConfiguredModels(config);
    streams.stdout(
      output === "json"
        ? formatModelListJson(config.defaultModel, models)
        : formatModelList(models),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}
