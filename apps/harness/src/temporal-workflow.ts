import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./temporal-activities.js";

const baselineActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute"
});

export async function immaculateTemporalBaselineWorkflow(input: {
  eventId: string;
  value: number;
}): Promise<{
  verified: boolean;
  checksum: string;
  route: string[];
}> {
  const ingested = await baselineActivities.ingest(input);
  const processed = await baselineActivities.processEnvelope(ingested);
  const committed = await baselineActivities.commitEnvelope(processed);
  return baselineActivities.verifyEnvelope(committed);
}
