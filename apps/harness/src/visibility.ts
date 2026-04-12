import type {
  AgentTurn,
  ActuationOutput,
  CognitiveExecution,
  ExecutionSchedule,
  EventEnvelope,
  IngestedDatasetSummary,
  NeuroFrameWindow,
  NeuroSessionSummary,
  NeuroStreamSummary,
  MultiAgentConversation,
  PhaseSnapshot
} from "@immaculate/core";
import type { BidsDatasetFile, BidsDatasetRecord } from "./bids.js";
import type { NwbSessionRecord } from "./nwb.js";

const REDACTED = "[redacted]";

type CognitiveExecutionTrace = CognitiveExecution & {
  routeSuggestion?: string;
  reasonSummary?: string;
  commitStatement?: string;
  guardVerdict?: string;
};

type PhaseSnapshotWithConversations = PhaseSnapshot & {
  conversations?: MultiAgentConversation[];
};

export type VisibilityScope =
  | "redacted"
  | "dataset"
  | "session"
  | "subject"
  | "actuation"
  | "intelligence"
  | "audit"
  | "benchmark";

function scrubIdentityToken(value: string): string {
  return value
    .replace(/sub-([^/_\\.]+)/g, "sub-[redacted]")
    .replace(/ses-([^/_\\.]+)/g, "ses-[redacted]");
}

function scrubDatasetFile(file: BidsDatasetFile): BidsDatasetFile {
  return {
    ...file,
    relativePath: scrubIdentityToken(file.relativePath),
    subject: undefined,
    session: undefined
  };
}

export function deriveVisibilityScope(consentScope?: string): VisibilityScope {
  if (!consentScope) {
    return "redacted";
  }
  if (consentScope.startsWith("system:audit")) {
    return "audit";
  }
  if (consentScope.startsWith("system:actuation")) {
    return "actuation";
  }
  if (consentScope.startsWith("system:intelligence")) {
    return "intelligence";
  }
  if (consentScope.startsWith("system:benchmark")) {
    return "benchmark";
  }
  if (consentScope.startsWith("subject:")) {
    return "subject";
  }
  if (consentScope.startsWith("dataset:")) {
    return "dataset";
  }
  if (consentScope.startsWith("session:")) {
    return "session";
  }
  return "redacted";
}

export function redactDatasetSummary(summary: IngestedDatasetSummary): IngestedDatasetSummary {
  return {
    ...summary,
    rootPath: REDACTED,
    subjects: [],
    sessions: []
  };
}

export function projectDatasetSummary(
  summary: IngestedDatasetSummary,
  consentScope?: string
): IngestedDatasetSummary {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "audit" || visibility === "subject") {
    return summary;
  }
  if (visibility === "dataset") {
    return {
      ...summary,
      subjects: [],
      sessions: []
    };
  }
  return redactDatasetSummary(summary);
}

export function projectDatasetRecord(
  record: BidsDatasetRecord,
  consentScope?: string
): BidsDatasetRecord {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "audit" || visibility === "subject") {
    return record;
  }
  if (visibility === "dataset") {
    return {
      ...record,
      summary: projectDatasetSummary(record.summary, consentScope),
      participantsPath: undefined,
      files: record.files.map(scrubDatasetFile)
    };
  }
  return {
    ...record,
    summary: projectDatasetSummary(record.summary),
    description: {},
    participantsPath: undefined,
    files: []
  };
}

export function redactNeuroStreamSummary(stream: NeuroStreamSummary): NeuroStreamSummary {
  return {
    ...stream,
    path: REDACTED
  };
}

function projectNeuroStreamSummary(
  stream: NeuroStreamSummary,
  consentScope?: string
): NeuroStreamSummary {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "audit" || visibility === "subject" || visibility === "session") {
    return stream;
  }
  return redactNeuroStreamSummary(stream);
}

export function redactNeuroSessionSummary(summary: NeuroSessionSummary): NeuroSessionSummary {
  return {
    ...summary,
    filePath: REDACTED,
    identifier: undefined,
    sessionDescription: undefined,
    streams: summary.streams.map(redactNeuroStreamSummary)
  };
}

export function projectNeuroSessionSummary(
  summary: NeuroSessionSummary,
  consentScope?: string
): NeuroSessionSummary {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "audit" || visibility === "subject") {
    return summary;
  }
  if (visibility === "session") {
    return {
      ...summary,
      identifier: undefined,
      sessionDescription: undefined,
      streams: summary.streams.map((stream) => projectNeuroStreamSummary(stream, consentScope))
    };
  }
  return redactNeuroSessionSummary(summary);
}

export function projectNeuroSessionRecord(
  record: NwbSessionRecord,
  consentScope?: string
): NwbSessionRecord {
  return {
    summary: projectNeuroSessionSummary(record.summary, consentScope)
  };
}

export function redactPhaseSnapshot(snapshot: PhaseSnapshot): PhaseSnapshot {
  const snapshotWithConversations = snapshot as PhaseSnapshotWithConversations;
  return {
    ...snapshot,
    datasets: snapshot.datasets.map(redactDatasetSummary),
    neuroSessions: snapshot.neuroSessions.map(redactNeuroSessionSummary),
    neuroFrames: snapshot.neuroFrames.map(redactNeuroFrameWindow),
    cognitiveExecutions: snapshot.cognitiveExecutions.map(redactCognitiveExecution),
    conversations: snapshotWithConversations.conversations?.map(redactConversationRecord),
    executionSchedules: snapshot.executionSchedules.map(redactExecutionSchedule),
    actuationOutputs: snapshot.actuationOutputs.map(redactActuationOutput),
    objective: projectDerivedText(snapshot.objective),
    logTail: snapshot.logTail.map((line) => projectDerivedText(line))
  };
}

export function summarizeEventEnvelope(event: EventEnvelope): EventEnvelope {
  return {
    ...event,
    payload: {
      eventType: event.schema.name,
      subjectType: event.subject.type,
      subjectId: event.subject.id
    }
  };
}

export function projectEventEnvelope(
  event: EventEnvelope,
  consentScope?: string
): EventEnvelope {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "audit") {
    return event;
  }
  if (visibility === "benchmark") {
    return {
      ...summarizeEventEnvelope(event),
      payload: {
        ...summarizeEventEnvelope(event).payload,
        benchmarkVisible: true
      }
    };
  }
  return summarizeEventEnvelope(event);
}

export function redactNeuroFrameWindow(frame: NeuroFrameWindow): NeuroFrameWindow {
  return {
    ...frame,
    sampleStart: 0,
    sampleEnd: 0,
    meanAbs: 0,
    rms: 0,
    peak: 0,
    syncJitterMs: 0,
    decodeReady: false,
    decodeConfidence: 0
  };
}

export function projectNeuroFrameWindow(
  frame: NeuroFrameWindow,
  consentScope?: string
): NeuroFrameWindow {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "session" || visibility === "subject" || visibility === "audit") {
    return frame;
  }
  if (visibility === "benchmark") {
    return {
      ...frame,
      meanAbs: 0,
      rms: 0,
      peak: 0
    };
  }
  return redactNeuroFrameWindow(frame);
}

export function redactCognitiveExecution(execution: CognitiveExecution): CognitiveExecution {
  return {
    ...(execution as CognitiveExecutionTrace),
    objective: REDACTED,
    promptDigest: REDACTED,
    responsePreview: REDACTED,
    routeSuggestion: REDACTED,
    reasonSummary: REDACTED,
    commitStatement: REDACTED,
    guardVerdict: execution.guardVerdict ? "unknown" : undefined
  };
}

export function projectCognitiveExecution(
  execution: CognitiveExecution,
  consentScope?: string
): CognitiveExecution {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "intelligence" || visibility === "audit") {
    return execution;
  }
  if (visibility === "benchmark") {
    return {
      ...execution,
      objective: REDACTED,
      promptDigest: REDACTED,
      responsePreview: REDACTED
    };
  }
  return redactCognitiveExecution(execution);
}

export function redactActuationOutput(output: ActuationOutput): ActuationOutput {
  return {
    ...output,
    command: REDACTED,
    intensity: 0,
    summary: REDACTED
  };
}

export function projectActuationOutput(
  output: ActuationOutput,
  consentScope?: string
): ActuationOutput {
  const visibility = deriveVisibilityScope(consentScope);
  if (
    visibility === "actuation" ||
    visibility === "session" ||
    visibility === "subject" ||
    visibility === "audit"
  ) {
    return output;
  }
  if (visibility === "benchmark") {
    return {
      ...output,
      command: REDACTED,
      intensity: 0,
      summary: REDACTED
    };
  }
  return redactActuationOutput(output);
}

export function redactExecutionSchedule(schedule: ExecutionSchedule): ExecutionSchedule {
  return {
    ...schedule,
    objective: REDACTED,
    rationale: REDACTED
  };
}

function redactConversationTurn(turn: AgentTurn): AgentTurn {
  return {
    ...turn,
    objective: REDACTED,
    responsePreview: REDACTED,
    routeSuggestion: REDACTED,
    reasonSummary: REDACTED,
    commitStatement: REDACTED,
    guardVerdict: turn.guardVerdict
  };
}

function redactConversationRecord(record: MultiAgentConversation): MultiAgentConversation {
  const safeOrder = Array.isArray(record.turns) && record.turns.length > 0
    ? record.turns.map((turn) => turn.role).join(">")
    : record.roles.join(">");
  return {
    ...record,
    finalRouteSuggestion: REDACTED,
    finalCommitStatement: REDACTED,
    summary: `mode=${record.mode} status=${record.status} turns=${record.turnCount} verdict=${record.guardVerdict} order=${safeOrder || "none"}`,
    turns: Array.isArray(record.turns) ? record.turns.map(redactConversationTurn) : [],
  };
}

export function projectConversation(
  record: MultiAgentConversation,
  consentScope?: string
): MultiAgentConversation {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "audit" || visibility === "intelligence") {
    return record;
  }

  if (visibility === "benchmark") {
    return {
      ...redactConversationRecord(record),
      turns: Array.isArray(record.turns) ? record.turns.map(redactConversationTurn) : []
    };
  }

  return redactConversationRecord(record);
}

export function projectExecutionSchedule(
  schedule: ExecutionSchedule,
  consentScope?: string
): ExecutionSchedule {
  const visibility = deriveVisibilityScope(consentScope);
  if (visibility === "intelligence" || visibility === "audit") {
    return schedule;
  }
  if (visibility === "benchmark") {
    return {
      ...schedule,
      objective: REDACTED,
      rationale: REDACTED
    };
  }
  return redactExecutionSchedule(schedule);
}

export function projectPhaseSnapshot(
  snapshot: PhaseSnapshot,
  consentScope?: string
): PhaseSnapshot {
  const visibility = deriveVisibilityScope(consentScope);
  const snapshotWithConversations = snapshot as PhaseSnapshotWithConversations;
  if (visibility === "audit") {
    return snapshot;
  }
  if (visibility === "benchmark") {
    const snapshotWithConversations = snapshot as PhaseSnapshotWithConversations;
    return {
      ...snapshot,
      datasets: snapshot.datasets.map(redactDatasetSummary),
      neuroSessions: snapshot.neuroSessions.map(redactNeuroSessionSummary),
      neuroFrames: snapshot.neuroFrames.map((frame) => projectNeuroFrameWindow(frame, consentScope)),
      cognitiveExecutions: snapshot.cognitiveExecutions.map((execution) =>
        projectCognitiveExecution(execution, consentScope)
      ),
      conversations: snapshotWithConversations.conversations?.map((conversation) =>
        projectConversation(conversation, consentScope)
      ),
      executionSchedules: snapshot.executionSchedules.map((schedule) =>
        projectExecutionSchedule(schedule, consentScope)
      ),
      actuationOutputs: snapshot.actuationOutputs.map((output) =>
        projectActuationOutput(output, consentScope)
      ),
      objective: projectDerivedText(snapshot.objective),
      logTail: snapshot.logTail.map((line) => projectDerivedText(line))
    };
  }

  return redactPhaseSnapshot(snapshot);
}

function projectDerivedText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (
    trimmed.startsWith("neuro frame ") ||
    trimmed.includes("decode confidence") ||
    trimmed.startsWith("cognitive execution ") ||
    trimmed.startsWith("Conversation ") ||
    trimmed.startsWith("Execution schedule ") ||
    trimmed.startsWith("actuation output ")
  ) {
    return "[redacted-derived-state]";
  }

  return trimmed;
}
