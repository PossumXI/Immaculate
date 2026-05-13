import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createEngine } from "@immaculate/core";
import {
  resolveQGenerateFastOptions,
  runOllamaChatCompletion,
  runOllamaExecution
} from "./ollama.js";

test("Q structured generation options allow bounded low-memory overrides", () => {
  assert.deepEqual(resolveQGenerateFastOptions({}), {
    numCtx: 2048,
    numBatch: 64
  });
  assert.deepEqual(
    resolveQGenerateFastOptions({
      IMMACULATE_OLLAMA_Q_GENERATE_NUM_CTX: "512",
      IMMACULATE_OLLAMA_Q_GENERATE_NUM_BATCH: "16"
    }),
    {
      numCtx: 512,
      numBatch: 16
    }
  );
  assert.deepEqual(
    resolveQGenerateFastOptions({
      IMMACULATE_OLLAMA_Q_GENERATE_NUM_CTX: "32",
      IMMACULATE_OLLAMA_Q_GENERATE_NUM_BATCH: "1"
    }),
    {
      numCtx: 512,
      numBatch: 8
    }
  );
});

test("Ollama chat runner serializes explicit thinking mode", async () => {
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
    assert.equal(capturedBodies[0].think, false);
    assert.equal(capturedBodies[1].think, true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("Q structured execution keeps enough context for orchestration prompts", async () => {
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
            content: JSON.stringify({
              route: "guarded",
              reason: "Late ACK indicates bridge path degradation.",
              commit: "Keep the route fail-closed."
            })
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
    const engine = createEngine({
      bootstrap: true,
      recordEvents: false
    });

    const result = await runOllamaExecution({
      snapshot: engine.getSnapshot(),
      layer: {
        id: "test-q-layer",
        name: "Q reasoner BridgeBench Layer",
        backend: "ollama",
        model: "q:latest",
        role: "reasoner",
        status: "ready",
        endpoint,
        registeredAt: new Date().toISOString()
      },
      objective: "A haptic bridge emits a late ACK after timeout.",
      governancePressure: "critical",
      context: "Preserve fail-closed behavior and the durable audit trail.",
      timeoutMs: 2_000
    });

    assert.equal(result.execution.status, "completed");
    assert.equal(capturedBodies.length, 1);
    assert.equal((capturedBodies[0].options as Record<string, unknown>).num_ctx, 2048);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
