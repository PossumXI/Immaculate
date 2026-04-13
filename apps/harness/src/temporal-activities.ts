export type TemporalBaselinePayload = {
  eventId: string;
  value: number;
};

export type TemporalBaselineEnvelope = {
  eventId: string;
  value: number;
  route: string[];
  checksum: string;
};

export async function ingest(
  payload: TemporalBaselinePayload
): Promise<TemporalBaselineEnvelope> {
  return {
    eventId: payload.eventId,
    value: payload.value + 1,
    route: ["ingest"],
    checksum: `ingest:${payload.eventId}:${payload.value + 1}`
  };
}

export async function processEnvelope(
  envelope: TemporalBaselineEnvelope
): Promise<TemporalBaselineEnvelope> {
  const nextValue = envelope.value * 2;
  return {
    ...envelope,
    value: nextValue,
    route: [...envelope.route, "process"],
    checksum: `${envelope.checksum}:process:${nextValue}`
  };
}

export async function commitEnvelope(
  envelope: TemporalBaselineEnvelope
): Promise<TemporalBaselineEnvelope> {
  return {
    ...envelope,
    route: [...envelope.route, "commit"],
    checksum: `${envelope.checksum}:commit`
  };
}

export async function verifyEnvelope(
  envelope: TemporalBaselineEnvelope
): Promise<{
  verified: boolean;
  checksum: string;
  route: string[];
}> {
  return {
    verified: envelope.route.includes("commit") && envelope.checksum.includes(":commit"),
    checksum: `${envelope.checksum}:verify`,
    route: [...envelope.route, "verify"]
  };
}
