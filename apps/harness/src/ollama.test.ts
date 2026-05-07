import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { runOllamaChatCompletion } from "./ollama.js";

test("Ollama chat runner omits disabled thinking flag while preserving explicit enablement", async () => {
  const capturedBodies: Array<Record<string, unknown>> = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      capturedBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.writeHead(200, {
        "content-type": "application/json"
      });
      response.end(
        JSON.stringify({
          message: {
            role: "assistant",
            content: "Gateway is fine."
          },
          done: true
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected loopback server to expose a port.");
    }
    const endpoint = `http://127.0.0.1:${(address as AddressInfo).port}`;
    const messages = [
      {
        role: "user" as const,
        content: "health"
      }
    ];

    await runOllamaChatCompletion({
      endpoint,
      model: "q",
      messages,
      think: false,
      timeoutMs: 2_000
    });
    await runOllamaChatCompletion({
      endpoint,
      model: "q",
      messages,
      think: true,
      timeoutMs: 2_000
    });

    assert.equal(capturedBodies.length, 2);
    assert.equal("think" in capturedBodies[0], false);
    assert.equal(capturedBodies[1].think, true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
