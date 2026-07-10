#!/usr/bin/env node
import { runCodegraphTokenUsageReport } from "../src/providers/codex/codegraphTokenUsageReport.mjs";

await runCodegraphTokenUsageReport(process.argv.slice(2));
