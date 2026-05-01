import test from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildOpenAICompatibleRequestUrl,
  buildOpenAICompatibleResponsesBody,
  extractOpenAICompatibleResponseText,
  runOpenAICompatibleResponsesCompletion
} from "./openai-compatible.js";
import { resolveQInferenceProfile } from "./q-inference-profile.js";

test("OpenAI-compatible responses body maps chat messages to Responses input items", () => {
  const body = buildOpenAICompatibleResponsesBody({
    model: "Q",
    messages: [
      {
        role: "system",
        content: "Stay inside the governed route."
      },
      {
        role: "user",
        content: "Return a route."
      }
    ],
    temperature: 0,
    maxTokens: 64,
    format: "json"
  });

  assert.equal(body.model, "Q");
  assert.equal(body.stream, false);
  assert.equal(body.max_output_tokens, 64);
  assert.equal(body.text?.format.type, "json_object");
  assert.deepEqual(body.input[0], {
    role: "system",
    content: [
      {
        type: "input_text",
        text: "Stay inside the governed route."
      }
    ]
  });
});

test("OpenAI-compatible responses body clamps user-controlled generation knobs", () => {
  const body = buildOpenAICompatibleResponsesBody({
    model: "Q",
    messages: [
      {
        role: "user",
        content: "health"
      }
    ],
    temperature: 99,
    maxTokens: 999_999
  });

  assert.equal(body.temperature, 2);
  assert.equal(body.max_output_tokens, 8_192);
});

test("OpenAI-compatible response extraction accepts Responses and chat fallback shapes", () => {
  assert.equal(
    extractOpenAICompatibleResponseText({
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "ROUTE: cognitive"
            }
          ]
        }
      ]
    }),
    "ROUTE: cognitive"
  );
  assert.equal(
    extractOpenAICompatibleResponseText({
      choices: [
        {
          message: {
            content: "Q gateway healthy"
          }
        }
      ]
    }),
    "Q gateway healthy"
  );
});

test("OpenAI-compatible runner posts to the configured responses path with redacted bearer auth", async () => {
  let capturedAuth = "";
  let capturedBody: unknown;
  const server = http.createServer((request, response) => {
    capturedAuth = request.headers.authorization ?? "";
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      capturedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, {
        "content-type": "application/json"
      });
      response.end(JSON.stringify({ output_text: "Q gateway healthy" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected loopback server to expose a port.");
    }
    const port = (address as AddressInfo).port;
    const profile = resolveQInferenceProfile({
      IMMACULATE_Q_INFERENCE_PROVIDER: "responses",
      IMMACULATE_Q_RESPONSES_BASE_URL: `http://127.0.0.1:${port}/openai/v1`,
      IMMACULATE_Q_RESPONSES_PATH: "/responses",
      IMMACULATE_Q_RESPONSES_API_KEY: "test-secret"
    });

    assert.equal(buildOpenAICompatibleRequestUrl(profile), `${profile.runtimeUrl}/responses`);
    const result = await runOpenAICompatibleResponsesCompletion({
      profile,
      model: "Q",
      messages: [
        {
          role: "user",
          content: "health"
        }
      ],
      maxTokens: 16,
      timeoutMs: 2_000
    });

    assert.equal(result.failureClass, undefined);
    assert.equal(result.response, "Q gateway healthy");
    assert.equal(capturedAuth, "Bearer test-secret");
    assert.equal((capturedBody as { model?: string }).model, "Q");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
