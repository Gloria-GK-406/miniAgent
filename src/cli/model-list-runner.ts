import {
  loadConfig,
  parseModelSelector,
  type CLIConfig,
  type LoadConfigOptions,
} from "./config.js";
import type { PrintStreams } from "./print-runner.js";

export type ModelListOutput = "text" | "json";

export interface ModelListRequest extends LoadConfigOptions {
  baseDir: string;
  output?: ModelListOutput;
}

export interface ConfiguredModelInfo {
  selector: string;
  provider: string;
  id: string;
  name: string;
  displayName?: string;
  default: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDefaultModel(
  config: Pick<CLIConfig, "defaultModel">,
  provider: string,
  id: string,
): boolean {
  const selector = parseModelSelector(config.defaultModel);
  if (selector === undefined) {
    return false;
  }
  if ("id" in selector) {
    if (selector.provider !== undefined) {
      return selector.provider === provider && selector.id === id;
    }
    return selector.id === id;
  }
  return selector.provider === provider && selector.model === id;
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
  try {
    const config = await loadConfigForModelList(request);
    const models = listConfiguredModels(config);
    streams.stdout(
      request.output === "json"
        ? formatModelListJson(config.defaultModel, models)
        : formatModelList(models),
    );
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}
