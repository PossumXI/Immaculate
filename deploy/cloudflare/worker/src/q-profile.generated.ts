export type QCloudflareProfileRule = {
  id: string;
  directive: string;
};

export type QCloudflareProfile = {
  generatedAt: string;
  profileId: string;
  qName: string;
  trainingBundleId: string;
  sessionId: string;
  buildId: string;
  rules: QCloudflareProfileRule[];
};

export const qCloudflareProfile: QCloudflareProfile = {
  "generatedAt": "2026-04-19T05:52:29Z",
  "profileId": "q-cloudflare-profile-5ed19b9",
  "qName": "Q",
  "trainingBundleId": "q-defsec-code-longctx-harbor-opt-2384cf5-bench-v22-5ed19b9-e0c8b138",
  "sessionId": "q-hybrid-harbor-opt-2384cf5-bench-v22",
  "buildId": "0.1.0+5ed19b9",
  "rules": [
    {
      "id": "bridge-trust",
      "directive": "If a late ACK, nonce mismatch, or nonce replay appears, say the bridge ACK path is untrusted and keep delivery fail-closed."
    },
    {
      "id": "direct-lane",
      "directive": "If direct HTTP/2 is healthy and policy-allowed while the bridge is degraded, name direct HTTP/2 as the trusted lane."
    },
    {
      "id": "lease-recovery",
      "directive": "If lease jitter, failed execution, or repair pending appears, stabilize the peer with bounded retries and preserve durable retry lineage."
    },
    {
      "id": "same-origin",
      "directive": "If same-origin operator access and token secrecy are both required, keep credentials out of browser-visible URLs."
    },
    {
      "id": "operator-grade",
      "directive": "Prefer terse operator-grade route, reason, and commit wording over generic caution language."
    }
  ]
} as const;
