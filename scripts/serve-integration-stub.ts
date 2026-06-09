import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { handleIntegrationContractRequest } from "../src/lib/integrationContractStub";

const port = Number.parseInt(process.env.TOKEN_REPORTING_INTEGRATION_STUB_PORT ?? "8787", 10);

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  const body = await readJsonBody(request);
  const result = await handleIntegrationContractRequest({
    body,
    method: request.method ?? "GET",
    path: request.url ?? "/"
  });

  writeJson(response, result.status, result.body, result.headers);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Token Reporting integration stub listening at http://127.0.0.1:${port}\n`
  );
});

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      raw += chunk;
    });
    request.on("end", () => {
      if (!raw.trim()) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "http://127.0.0.1",
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });

  response.end(status === 204 ? "" : JSON.stringify(body, null, 2));
}
