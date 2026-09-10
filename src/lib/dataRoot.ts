import path from "node:path";

/** One filesystem root shared by collectors, their history cursors, and HTTP readers. */
export interface DataRootOptions {
  dataRoot?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/** Explicit options override environment; unconfigured local use retains cwd/public/data. */
export function resolveDataRoot(options: DataRootOptions = {}): string {
  const env = options.env ?? process.env;
  const configured = options.dataRoot ?? env.TOKEN_REPORTING_DATA_ROOT;
  if (configured !== undefined && configured.trim() === "") {
    throw new Error("Data root must not be empty; omit the setting to use the local default.");
  }
  return path.resolve(
    options.cwd ?? process.cwd(),
    configured ?? path.join("public", "data")
  );
}
