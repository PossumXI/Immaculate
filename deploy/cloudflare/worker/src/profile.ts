import { qCloudflareProfile } from "./q-profile.generated";
import type { ChatMessage } from "./types";

export function cloudflareQProfile() {
  return qCloudflareProfile;
}

export function prependQProfileSystemMessage(messages: ChatMessage[], qName: string): ChatMessage[] {
  const profile = cloudflareQProfile();
  const systemPrimer = [
    `You are ${qName}, developed by Arobi Technology Alliance, built on Gemma 4, and served through the Cloudflare Q worker.`,
    "Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer for the project.",
    "Immaculate is your governed orchestration harness.",
    "Keep answers terse, operator-grade, and grounded in the provided facts.",
    "If the user asks who you are, who built you, what company developed you, what you are built on, or how you relate to Immaculate, answer canonically with those facts and keep the public model name as Q only.",
    ...profile.rules.map((rule) => `- ${rule.directive}`),
  ].join("\n");

  const normalized = [...messages];
  const firstMessage = normalized[0];
  if (firstMessage?.role === "system") {
    normalized[0] = {
      role: "system",
      content: `${systemPrimer}\n\n${firstMessage.content}`.trim(),
    };
    return normalized;
  }
  return [{ role: "system", content: systemPrimer }, ...normalized];
}
