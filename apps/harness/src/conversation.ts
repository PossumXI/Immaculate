import {
  type AgentTurn,
  type CognitiveExecution,
  type ExecutionSchedule,
  type GuardVerdict,
  type IntelligenceLayer,
  type IntelligenceLayerRole,
  type MultiAgentConversation
} from "@immaculate/core";
import { hashValue } from "./utils.js";

const SESSION_CONVERSATION_LIMIT = 5;

function compact(value: string, maxLength = 160): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function roleDirective(role: IntelligenceLayerRole): string {
  if (role === "soul") {
    return "Synthesize long-horizon intent, alignment, and system posture before commitment.";
  }
  if (role === "reasoner") {
    return "Stress-test the proposed route under constraints and refine the next safe commit.";
  }
  if (role === "guard") {
    return "Approve or block the final action. Always include a clear verdict.";
  }
  return "Frame the immediate route, reason, and commit from the live substrate state.";
}

function latestValue<T>(values: T[]): T | undefined {
  return values.length > 0 ? values[values.length - 1] : undefined;
}

export type SessionConversationMemory = {
  sessionId?: string;
  conversationCount: number;
  blockedVerdictCount: number;
  approvedVerdictCount: number;
  recentRouteHints: string[];
  recentCommitStatements: string[];
  recentGuardVerdicts: GuardVerdict[];
};

export function buildConversationObjective(options: {
  baseObjective: string;
  role: IntelligenceLayerRole;
  priorTurns: AgentTurn[];
}): { objective: string; context?: string } {
  const objective = options.baseObjective.trim();
  if (options.priorTurns.length === 0) {
    return {
      objective,
      context: roleDirective(options.role)
    };
  }

  const priorContext = options.priorTurns
    .map(
      (turn) =>
        `${turn.role.toUpperCase()} route=${turn.routeSuggestion ?? "none"} reason=${turn.reasonSummary ?? "none"} commit=${turn.commitStatement ?? "none"} verdict=${turn.guardVerdict ?? "unknown"}`
    )
    .join("\n");

  return {
    objective,
    context: `${roleDirective(options.role)}\nPRIOR TURNS:\n${priorContext}`
  };
}

export function buildSessionConversationMemory(options: {
  conversations: MultiAgentConversation[];
  sessionId?: string;
  limit?: number;
}): SessionConversationMemory {
  const limit = Math.max(1, options.limit ?? SESSION_CONVERSATION_LIMIT);
  const sessionConversations = options.conversations.filter((conversation) => {
    if (typeof options.sessionId === "string") {
      return conversation.sessionId === options.sessionId;
    }
    return conversation.sessionId === undefined;
  });
  const recentConversations = sessionConversations.slice(-limit);

  return {
    sessionId: options.sessionId,
    conversationCount: sessionConversations.length,
    blockedVerdictCount: sessionConversations.filter(
      (conversation) => conversation.guardVerdict === "blocked"
    ).length,
    approvedVerdictCount: sessionConversations.filter(
      (conversation) => conversation.guardVerdict === "approved"
    ).length,
    recentRouteHints: recentConversations
      .map((conversation) => conversation.finalRouteSuggestion)
      .filter((value): value is string => Boolean(value))
      .slice(-limit),
    recentCommitStatements: recentConversations
      .map((conversation) => conversation.finalCommitStatement)
      .filter((value): value is string => Boolean(value))
      .slice(-limit),
    recentGuardVerdicts: recentConversations
      .map((conversation) => conversation.guardVerdict)
      .slice(-limit)
  };
}

export function buildAgentTurn(options: {
  execution: CognitiveExecution;
  layer: IntelligenceLayer;
}): AgentTurn {
  return {
    id: `turn-${hashValue(`${options.execution.id}:${options.layer.role}:${options.execution.completedAt}`)}`,
    layerId: options.layer.id,
    role: options.layer.role,
    model: options.layer.model,
    status: options.execution.status,
    objective: options.execution.objective,
    responsePreview: options.execution.responsePreview,
    routeSuggestion: options.execution.routeSuggestion,
    reasonSummary: options.execution.reasonSummary,
    commitStatement: options.execution.commitStatement,
    guardVerdict: options.execution.guardVerdict,
    latencyMs: options.execution.latencyMs,
    startedAt: options.execution.startedAt,
    completedAt: options.execution.completedAt
  };
}

function deriveGuardVerdict(turns: AgentTurn[]): GuardVerdict {
  const guardTurn = [...turns].reverse().find((turn) => turn.role === "guard");
  return guardTurn?.guardVerdict ?? latestValue(turns)?.guardVerdict ?? "unknown";
}

function deriveConversationStatus(turns: AgentTurn[], verdict: GuardVerdict): MultiAgentConversation["status"] {
  if (turns.some((turn) => turn.status === "failed")) {
    return "failed";
  }
  if (verdict === "blocked") {
    return "blocked";
  }
  return "completed";
}

export function buildConversationRecord(options: {
  sessionId?: string;
  arbitrationId?: string;
  schedule: ExecutionSchedule;
  turns: AgentTurn[];
}): MultiAgentConversation {
  const turns = options.turns.slice(0, 24);
  const startedAt = turns[0]?.startedAt ?? options.schedule.selectedAt;
  const completedAt = latestValue(turns)?.completedAt ?? startedAt;
  const roles = turns.map((turn) => turn.role);
  const guardVerdict = deriveGuardVerdict(turns);
  const finalTurn = latestValue(turns);
  const finalRouteSuggestion =
    [...turns].reverse().find((turn) => turn.routeSuggestion)?.routeSuggestion ?? finalTurn?.routeSuggestion;
  const finalCommitStatement =
    [...turns].reverse().find((turn) => turn.commitStatement)?.commitStatement ?? finalTurn?.commitStatement;
  const status = deriveConversationStatus(turns, guardVerdict);
  const roleChain = roles.join(">");

  return {
    id: `conv-${hashValue(`${options.schedule.id}:${completedAt}:${roleChain}`)}`,
    sessionId: options.sessionId,
    arbitrationId: options.arbitrationId,
    scheduleId: options.schedule.id,
    mode: turns.length > 1 ? "multi-turn" : "single-turn",
    status,
    roles,
    turnCount: turns.length,
    guardVerdict,
    finalRouteSuggestion,
    finalCommitStatement,
    summary: compact(
      `${options.schedule.mode} ${status} roles=${roleChain || "none"} verdict=${guardVerdict} route=${finalRouteSuggestion ?? "none"}`
    ),
    startedAt,
    completedAt,
    turns
  };
}
