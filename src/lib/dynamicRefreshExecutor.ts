import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  DynamicProviderRefreshResult,
  DynamicRefreshExecutionResult,
  DynamicRefreshExecutor
} from "./integrationContractDynamic";
import type { ObservabilityLogger } from "./observabilityLogger";

const execFileAsync = promisify(execFile);

export interface ProviderScriptRunResult {
  failureReason?: string;
  ok: boolean;
  stderr?: string;
  stdout?: string;
}

export type ProviderScriptRunner = (
  scriptName: string,
  env: NodeJS.ProcessEnv
) => Promise<ProviderScriptRunResult>;

export interface ProviderScriptRefreshExecutorOptions {
  env?: NodeJS.ProcessEnv;
  logger?: ObservabilityLogger;
  now?: () => Date;
  runScript?: ProviderScriptRunner;
}

interface ProviderRefreshScript {
  providerId: string;
  requiredEnv?: string;
  scriptName: string;
}

const providerScripts: ProviderRefreshScript[] = [
  { providerId: "claude", requiredEnv: "ANTHROPIC_ADMIN_API_KEY", scriptName: "report:claude" },
  { providerId: "claude-code", scriptName: "report:claude-code" },
  {
    providerId: "github-copilot",
    requiredEnv: "GITHUB_ADMIN_TOKEN",
    scriptName: "report:copilot"
  },
  { providerId: "cursor", requiredEnv: "CURSOR_ADMIN_API_KEY", scriptName: "report:cursor" },
  { providerId: "codex", requiredEnv: "OPENAI_ADMIN_API_KEY", scriptName: "report:codex" }
];

export function createProviderScriptRefreshExecutor(
  options: ProviderScriptRefreshExecutorOptions = {}
): DynamicRefreshExecutor {
  const env = options.env ?? process.env;
  const logger = options.logger?.withContext({ component: "dynamicRefreshExecutor" });
  const now = options.now ?? (() => new Date());
  const runScript = options.runScript ?? runNpmScript;

  return async (request): Promise<DynamicRefreshExecutionResult> => {
    logger?.info("Provider refresh started", {
      includeForensicModelProfiles: request.includeForensicModelProfiles,
      includeHuggingFaceRefresh: request.includeHuggingFaceRefresh,
      mode: request.mode,
      providerCount: request.providers.length,
      providers: request.providers,
      reviewerModels: request.reviewerModels
    });
    const sharedScriptEnv = refreshScriptEnvironment(env, request.mode);
    let huggingFaceCandidateSetId: string | undefined;
    if (request.includeHuggingFaceRefresh) {
      logger?.info("Hugging Face candidate refresh started");
      const startedAt = Date.now();
      const result = await runScript("report:huggingface-candidates", sharedScriptEnv);
      const durationMs = Date.now() - startedAt;
      if (result.ok) {
        huggingFaceCandidateSetId = readHuggingFaceCandidateSetId(result.stdout);
        logger?.info("Hugging Face candidate refresh completed", {
          durationMs,
          huggingFaceCandidateSetId
        });
        logger?.trace("Hugging Face candidate refresh output", {
          durationMs,
          stderr: result.stderr,
          stdout: result.stdout
        });
      } else {
        logger?.error("Hugging Face candidate refresh failed", {
          durationMs,
          stderr: result.stderr,
          stdout: result.stdout
        });
      }
    }

    const providerResults = await Promise.all(
      request.providers.map(async (providerId): Promise<DynamicProviderRefreshResult> => {
        const startedAt = now().toISOString();
        const script = providerScripts.find((candidate) => candidate.providerId === providerId);
        if (!script) {
          logger?.info("Provider refresh degraded by unregistered provider script", {
            providerId
          });
          return {
            completedAt: now().toISOString(),
            degradedReason: "provider_refresh_script_not_registered",
            providerId,
            startedAt,
            status: "degraded"
          };
        }
        if (script.requiredEnv && !env[script.requiredEnv]) {
          logger?.info("Provider refresh degraded by missing admin configuration", {
            providerId,
            requiredEnv: script.requiredEnv
          });
          return {
            completedAt: now().toISOString(),
            degradedReason: `${script.requiredEnv}_not_configured`,
            providerId,
            startedAt,
            status: "degraded"
          };
        }

        const scriptEnv = refreshScriptEnvironment(env, request.mode);
        logger?.debug("Provider refresh script started", {
          providerId,
          scriptName: script.scriptName
        });
        const startedMs = Date.now();
        const result = await runScript(script.scriptName, scriptEnv);
        const durationMs = Date.now() - startedMs;
        if (result.ok) {
          logger?.info("Provider refresh script completed", {
            durationMs,
            providerId,
            scriptName: script.scriptName
          });
          logger?.trace("Provider refresh script output", {
            durationMs,
            providerId,
            scriptName: script.scriptName,
            stderr: result.stderr,
            stdout: result.stdout
          });
        } else {
          logger?.error("Provider refresh script failed", {
            durationMs,
            failureReason: result.failureReason,
            providerId,
            scriptName: script.scriptName,
            stderr: result.stderr,
            stdout: result.stdout
          });
        }

        return {
          completedAt: now().toISOString(),
          degradedReason: result.ok
            ? undefined
            : result.failureReason ?? result.stderr ?? result.stdout ?? "script_failed",
          providerId,
          startedAt,
          status: result.ok ? "completed" : "failed"
        };
      })
    );

    return { huggingFaceCandidateSetId, providerResults };
  };
}

function refreshScriptEnvironment(
  env: NodeJS.ProcessEnv,
  mode: "historical" | "incremental"
): NodeJS.ProcessEnv {
  return {
    ...env,
    ...(mode === "historical" ? { TOKEN_REPORTING_FETCH_MODE: "historical" } : {})
  };
}

async function runNpmScript(
  scriptName: string,
  env: NodeJS.ProcessEnv
): Promise<ProviderScriptRunResult> {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  try {
    const { stderr, stdout } = await execFileAsync(npmCommand, ["run", scriptName], {
      env
    });

    return { ok: true, stderr, stdout };
  } catch (error) {
    const failure = error as {
      code?: string;
      message?: string;
      stderr?: string;
      stdout?: string;
      syscall?: string;
    };
    const npmMissing = failure.code === "ENOENT" || failure.syscall === `spawn ${npmCommand}`;
    return {
      failureReason: npmMissing ? "npm_not_found_or_path_missing" : undefined,
      ok: false,
      stderr:
        failure.stderr ??
        (npmMissing
          ? `${npmCommand} command not found; PATH may be missing for LaunchAgent startup.`
          : failure.message),
      stdout: failure.stdout
    };
  }
}

function readHuggingFaceCandidateSetId(stdout: string | undefined): string | undefined {
  if (!stdout) return undefined;

  const explicitLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^Hugging Face candidate set id:/i.test(line));
  if (explicitLine) {
    return explicitLine.split(":").slice(1).join(":").trim() || undefined;
  }

  const inline = /"candidateSetId"\s*:\s*"([^"]+)"/.exec(stdout);
  return inline?.[1];
}
