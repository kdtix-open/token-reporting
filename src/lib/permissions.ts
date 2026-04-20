const READ_ONLY_ENV_VAR = "TOKEN_REPORTING_READ_ONLY";

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isReadOnlyModeEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isTruthy(env[READ_ONLY_ENV_VAR]);
}

export function assertWritableOperationAllowed(
  operation: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (isReadOnlyModeEnabled(env)) {
    throw new Error(
      `${operation} is disabled while ${READ_ONLY_ENV_VAR} is enabled.`
    );
  }
}
