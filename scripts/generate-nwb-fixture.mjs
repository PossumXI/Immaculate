import path from "node:path";
import { mkdir } from "node:fs/promises";
import h5wasm from "h5wasm/node";

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, "fixtures", "nwb", "minimal");
const outputPath = path.join(outputDir, "minimal-session.nwb");

await mkdir(outputDir, { recursive: true });
await h5wasm.ready;

const file = new h5wasm.File(outputPath, "w");

try {
  file.create_attribute("nwb_version", "2.9.0");
  file.create_attribute("identifier", "immaculate-minimal-session");
  file.create_attribute(
    "session_description",
    "Minimal NWB neurophysiology fixture for synchronize/decode ingestion tests."
  );

  const acquisition = file.create_group("acquisition");

  const electricalSeries = acquisition.create_group("ElectricalSeries");
  electricalSeries.create_attribute("neurodata_type", "ElectricalSeries");
  electricalSeries.create_dataset({
    name: "data",
    data: new Float32Array([
      0.11, 0.09, 0.07, 0.12,
      0.14, 0.1, 0.08, 0.13,
      0.15, 0.12, 0.09, 0.16,
      0.13, 0.11, 0.08, 0.14,
      0.12, 0.1, 0.07, 0.11,
      0.16, 0.13, 0.09, 0.17,
      0.14, 0.11, 0.08, 0.12,
      0.15, 0.12, 0.09, 0.16
    ]),
    shape: [8, 4]
  });
  electricalSeries.get("data").create_attribute("unit", "volts");
  electricalSeries.create_dataset({
    name: "starting_time",
    data: new Float32Array([0]),
    shape: [1]
  });
  electricalSeries.get("starting_time").create_attribute("rate", 1000);
  electricalSeries.get("starting_time").create_attribute("unit", "seconds");
  electricalSeries.create_dataset({
    name: "electrodes",
    data: new Int32Array([0, 1, 2, 3]),
    shape: [4]
  });

  const lfpSeries = acquisition.create_group("LFPSeries");
  lfpSeries.create_attribute("neurodata_type", "LFP");
  lfpSeries.create_dataset({
    name: "data",
    data: new Float32Array([
      0.04, 0.03, 0.05, 0.02,
      0.05, 0.04, 0.06, 0.03,
      0.05, 0.03, 0.07, 0.02,
      0.06, 0.04, 0.08, 0.03,
      0.05, 0.03, 0.06, 0.02,
      0.07, 0.05, 0.09, 0.04
    ]),
    shape: [6, 4]
  });
  lfpSeries.get("data").create_attribute("unit", "volts");
  lfpSeries.create_dataset({
    name: "starting_time",
    data: new Float32Array([0]),
    shape: [1]
  });
  lfpSeries.get("starting_time").create_attribute("rate", 250);
  lfpSeries.get("starting_time").create_attribute("unit", "seconds");
  lfpSeries.create_dataset({
    name: "electrodes",
    data: new Int32Array([0, 1, 2, 3]),
    shape: [4]
  });

  const processing = file.create_group("processing");
  const ecephys = processing.create_group("ecephys");
  ecephys.create_attribute("neurodata_type", "ProcessingModule");

  file.flush();
} finally {
  file.close();
}

console.log(outputPath);
