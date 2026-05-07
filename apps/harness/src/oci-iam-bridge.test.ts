import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runOciIamBridgeResponsesCompletion } from "./oci-iam-bridge.js";
import { resolveQInferenceProfile } from "./q-inference-profile.js";

test("OCI IAM bridge runner invokes the configured helper without exposing auth material", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oci-iam-bridge-runner-"));
  try {
    const scriptPath = path.join(root, "bridge.mjs");
    const configPath = path.join(root, "config");
    await writeFile(
      scriptPath,
      [
        "import { readFileSync } from 'node:fs';",
        "const args = process.argv.slice(2);",
        "const valueAfter = (name) => args[args.indexOf(name) + 1];",
        "const input = JSON.parse(readFileSync(valueAfter('--input-file'), 'utf8'));",
        "console.log(JSON.stringify({",
        "  ok: true,",
        "  text: `bridge ok: ${input[0].content[0].text}`,",
        "  model: valueAfter('--model'),",
        "  base_url: valueAfter('--base-url'),",
        "  auth_mode: 'iam',",
        "  profile: valueAfter('--profile')",
        "}));"
      ].join("\n"),
      "utf8"
    );
    await writeFile(configPath, "[DEFAULT]\nregion=us-ashburn-1\n", "utf8");
    const profile = resolveQInferenceProfile({
      IMMACULATE_Q_INFERENCE_PROVIDER: "oci-iam-bridge",
      IMMACULATE_Q_OCI_BASE_URL:
        "https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1",
      IMMACULATE_Q_OCI_BRIDGE_SCRIPT: scriptPath,
      IMMACULATE_Q_OCI_CONFIG_FILE: configPath,
      IMMACULATE_Q_OCI_PROFILE: "DEFAULT",
      IMMACULATE_Q_OCI_COMPARTMENT_ID: "ocid1.tenancy.oc1..example",
      IMMACULATE_Q_OCI_PROJECT_ID: "ocid1.generativeaiproject.oc1.iad.example",
      IMMACULATE_Q_OCI_MODEL: "openai.gpt-oss-120b",
      IMMACULATE_Q_OCI_PYTHON: process.execPath
    });

    const result = await runOciIamBridgeResponsesCompletion({
      profile,
      model: "q",
      messages: [
        {
          role: "user",
          content: "health"
        }
      ],
      maxTokens: 12,
      temperature: 0,
      timeoutMs: 5_000
    });

    assert.equal(result.failureClass, undefined);
    assert.equal(result.model, "openai.gpt-oss-120b");
    assert.equal(result.response, "bridge ok: health");
    assert.equal(result.responsePreview.includes("ocid1."), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
