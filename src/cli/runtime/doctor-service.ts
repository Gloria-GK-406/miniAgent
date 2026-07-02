import type { SessionMeta } from "../../core/session.js";
import type { CLIConfig } from "../config.js";
import type { DiagnosticsService } from "./diagnostics-service.js";
import type { GitService } from "./git-service.js";

export type CLIDoctorStatus = "pass" | "warn" | "fail";

export interface CLIDoctorCheck {
  id: string;
  label: string;
  status: CLIDoctorStatus;
  detail: string;
}

export interface CLIDoctorSnapshot {
  config: CLIConfig;
  modelName: string;
  modelPaths: string[];
  sessionId: string;
  sessions: SessionMeta[];
  referencePaths: string[];
  inputHistory: string[];
  autoApprove: boolean;
}

export interface DoctorService {
  run(snapshot: CLIDoctorSnapshot): Promise<CLIDoctorCheck[]>;
}

export interface CreateDoctorServiceOptions {
  gitService: Pick<GitService, "isRepository" | "branchName">;
  diagnosticsService: Pick<DiagnosticsService, "discoverCommands">;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function check(
  id: string,
  label: string,
  status: CLIDoctorStatus,
  detail: string,
): CLIDoctorCheck {
  return { id, label, status, detail };
}

function configurationCheck(snapshot: CLIDoctorSnapshot): CLIDoctorCheck {
  const providerCount = snapshot.config.providers.length;
  const modelCount = snapshot.config.providers.reduce(
    (total, provider) => total + provider.models.length,
    0,
  );
  if (providerCount === 0) {
    return check("configuration", "Configuration", "fail", "No model providers configured");
  }
  if (modelCount === 0) {
    return check("configuration", "Configuration", "fail", "No provider models configured");
  }
  return check(
    "configuration",
    "Configuration",
    "pass",
    `${plural(providerCount, "provider")}, ${plural(modelCount, "model")}`,
  );
}

function modelCheck(snapshot: CLIDoctorSnapshot): CLIDoctorCheck {
  if (snapshot.modelPaths.length === 0) {
    return check("model", "Default model", "fail", "No resolved models are available");
  }
  if (snapshot.modelName === "(none)") {
    return check("model", "Default model", "fail", "No model is selected");
  }
  return check("model", "Default model", "pass", `Using ${snapshot.modelName}`);
}

function sessionCheck(snapshot: CLIDoctorSnapshot): CLIDoctorCheck {
  if (snapshot.sessions.length === 0) {
    return check("sessions", "Sessions", "fail", "No sessions are available");
  }
  const active = snapshot.sessions.find((session) => session.id === snapshot.sessionId);
  if (active === undefined) {
    return check("sessions", "Sessions", "fail", `Active session ${snapshot.sessionId} is missing`);
  }
  return check(
    "sessions",
    "Sessions",
    "pass",
    `${active.name} (${active.id.slice(0, 8)}), ${plural(snapshot.sessions.length, "session")}`,
  );
}

function workspaceCheck(snapshot: CLIDoctorSnapshot): CLIDoctorCheck {
  if (snapshot.referencePaths.length === 0) {
    return check("workspace", "Workspace index", "warn", "No referenceable project files found");
  }
  return check(
    "workspace",
    "Workspace index",
    "pass",
    `${plural(snapshot.referencePaths.length, "reference")} available`,
  );
}

async function gitCheck(gitService: CreateDoctorServiceOptions["gitService"]): Promise<CLIDoctorCheck> {
  try {
    if (!await gitService.isRepository()) {
      return check("git", "Git", "warn", "Workspace is not a Git repository");
    }
    try {
      const branch = await gitService.branchName();
      return check("git", "Git", "pass", `Repository on ${branch.length === 0 ? "detached HEAD" : branch}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return check("git", "Git", "warn", `Repository detected, branch unavailable: ${message}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return check("git", "Git", "warn", `Git check failed: ${message}`);
  }
}

async function diagnosticsCheck(
  diagnosticsService: CreateDoctorServiceOptions["diagnosticsService"],
): Promise<CLIDoctorCheck> {
  try {
    const commands = await diagnosticsService.discoverCommands();
    if (commands.length === 0) {
      return check("diagnostics", "Diagnostics", "warn", "No diagnostic commands configured or discovered");
    }
    return check("diagnostics", "Diagnostics", "pass", `${plural(commands.length, "command")}: ${commands.join(", ")}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return check("diagnostics", "Diagnostics", "warn", `Discovery failed: ${message}`);
  }
}

function permissionsCheck(snapshot: CLIDoctorSnapshot): CLIDoctorCheck {
  if (snapshot.autoApprove) {
    return check("permissions", "Permissions", "warn", "Auto approval is enabled");
  }
  return check("permissions", "Permissions", "pass", "Approval prompts are enabled");
}

function historyCheck(snapshot: CLIDoctorSnapshot): CLIDoctorCheck {
  return check(
    "history",
    "Prompt history",
    "pass",
    `${plural(snapshot.inputHistory.length, "entry")} loaded`,
  );
}

export function createDoctorService(options: CreateDoctorServiceOptions): DoctorService {
  return {
    run: async (snapshot) => [
      configurationCheck(snapshot),
      modelCheck(snapshot),
      sessionCheck(snapshot),
      workspaceCheck(snapshot),
      await gitCheck(options.gitService),
      await diagnosticsCheck(options.diagnosticsService),
      permissionsCheck(snapshot),
      historyCheck(snapshot),
    ],
  };
}
