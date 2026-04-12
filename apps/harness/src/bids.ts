import path from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import {
  datasetModalities,
  datasetSummarySchema,
  type DatasetModality,
  type IngestedDatasetSummary
} from "@immaculate/core";
import { hashValue } from "./utils.js";

export type BidsDatasetFile = {
  relativePath: string;
  sizeBytes: number;
  subject?: string;
  session?: string;
  modality: DatasetModality;
  suffix?: string;
  extension: string;
};

export type BidsDatasetRecord = {
  summary: IngestedDatasetSummary;
  description: Record<string, unknown>;
  participantsPath?: string;
  files: BidsDatasetFile[];
};

type DatasetIndexEntry = {
  id: string;
  name: string;
  source: "bids";
  rootPath: string;
  filePath: string;
  registeredAt: string;
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function splitExtension(fileName: string): { stem: string; extension: string } {
  if (fileName.endsWith(".nii.gz")) {
    return {
      stem: fileName.slice(0, -7),
      extension: ".nii.gz"
    };
  }

  const extension = path.extname(fileName);
  return {
    stem: extension.length > 0 ? fileName.slice(0, -extension.length) : fileName,
    extension
  };
}

function inferModality(relativePath: string): DatasetModality {
  const segments = normalizePath(relativePath).split("/");
  for (const segment of segments) {
    if ((datasetModalities as readonly string[]).includes(segment)) {
      return segment as DatasetModality;
    }
  }
  return "unknown";
}

function parseEntityToken(token: string): { key: string; value: string } | null {
  const separatorIndex = token.indexOf("-");
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return null;
  }

  return {
    key: token.slice(0, separatorIndex),
    value: token.slice(separatorIndex + 1)
  };
}

function parseFileMetadata(relativePath: string, sizeBytes: number): BidsDatasetFile {
  const normalized = normalizePath(relativePath);
  const fileName = path.basename(normalized);
  const { stem, extension } = splitExtension(fileName);
  const tokens = stem.split("_");
  const suffix = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
  const entities = new Map(
    tokens
      .slice(0, Math.max(0, tokens.length - 1))
      .flatMap((token) => {
        const parsed = parseEntityToken(token);
        return parsed ? [[parsed.key, parsed.value] as const] : [];
      })
  );

  return {
    relativePath: normalized,
    sizeBytes,
    subject: entities.get("sub"),
    session: entities.get("ses"),
    modality: inferModality(normalized),
    suffix,
    extension
  };
}

async function walkFiles(rootPath: string, currentPath = rootPath): Promise<string[]> {
  const entries = await readdir(currentPath, {
    withFileTypes: true
  });

  const nested = await Promise.all(
    entries.flatMap(async (entry) => {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(rootPath, fullPath);
      }

      if (entry.isFile()) {
        return [fullPath];
      }

      return [];
    })
  );

  return nested.flat();
}

export async function scanBidsDataset(rootPath: string): Promise<BidsDatasetRecord> {
  const resolvedRoot = path.resolve(rootPath);
  const datasetDescriptionPath = path.join(resolvedRoot, "dataset_description.json");
  const descriptionContent = await readFile(datasetDescriptionPath, "utf8");
  const description = JSON.parse(descriptionContent) as Record<string, unknown>;

  const filesOnDisk = await walkFiles(resolvedRoot);
  const files = (
    await Promise.all(
      filesOnDisk.map(async (filePath) => {
        const fileStat = await stat(filePath);
        const relativePath = normalizePath(path.relative(resolvedRoot, filePath));
        return parseFileMetadata(relativePath, fileStat.size);
      })
    )
  ).sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const subjects = Array.from(
    new Set(files.map((file) => file.subject).filter((value): value is string => Boolean(value)))
  ).sort();
  const sessions = Array.from(
    new Set(files.map((file) => file.session).filter((value): value is string => Boolean(value)))
  ).sort();
  const modalities = Array.from(
    files.reduce((accumulator, file) => {
      accumulator.set(file.modality, (accumulator.get(file.modality) ?? 0) + 1);
      return accumulator;
    }, new Map<DatasetModality, number>())
  )
    .map(([modality, fileCount]) => ({
      modality,
      fileCount
    }))
    .sort((left, right) => left.modality.localeCompare(right.modality));

  const participantsPath = files.find((file) => file.relativePath === "participants.tsv")?.relativePath;
  const summary = datasetSummarySchema.parse({
    id: `bids-${hashValue(resolvedRoot)}`,
    source: "bids",
    name:
      typeof description.Name === "string" && description.Name.length > 0
        ? description.Name
        : path.basename(resolvedRoot),
    rootPath: resolvedRoot,
    bidsVersion: typeof description.BIDSVersion === "string" ? description.BIDSVersion : undefined,
    datasetType: typeof description.DatasetType === "string" ? description.DatasetType : undefined,
    subjectCount: subjects.length,
    sessionCount: sessions.length,
    fileCount: files.length,
    sizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    modalities,
    subjects,
    sessions,
    ingestedAt: new Date().toISOString()
  }) as IngestedDatasetSummary;

  return {
    summary,
    description,
    participantsPath,
    files
  };
}

export function createDatasetRegistry(rootDir: string) {
  const datasetsDir = path.join(rootDir, "datasets");
  const indexPath = path.join(datasetsDir, "index.json");

  async function ensureRoot(): Promise<void> {
    await mkdir(datasetsDir, { recursive: true });
  }

  async function loadIndex(): Promise<DatasetIndexEntry[]> {
    await ensureRoot();

    try {
      const content = await readFile(indexPath, "utf8");
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .flatMap((entry) => {
          if (!entry || typeof entry !== "object") {
            return [];
          }
          const candidate = entry as Partial<DatasetIndexEntry>;
          if (
            typeof candidate.id !== "string" ||
            typeof candidate.name !== "string" ||
            candidate.source !== "bids" ||
            typeof candidate.rootPath !== "string" ||
            typeof candidate.filePath !== "string" ||
            typeof candidate.registeredAt !== "string"
          ) {
            return [];
          }
          return [
            {
              id: candidate.id,
              name: candidate.name,
              source: "bids" as const,
              rootPath: candidate.rootPath,
              filePath: candidate.filePath,
              registeredAt: candidate.registeredAt
            }
          ];
        })
        .sort((left, right) => Date.parse(right.registeredAt) - Date.parse(left.registeredAt));
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (candidate.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function writeIndex(entries: DatasetIndexEntry[]): Promise<void> {
    await ensureRoot();
    await writeFile(indexPath, JSON.stringify(entries, null, 2), "utf8");
  }

  return {
    async register(record: BidsDatasetRecord): Promise<BidsDatasetRecord> {
      await ensureRoot();
      const filePath = path.join(datasetsDir, `${record.summary.id}.json`);
      await writeFile(filePath, JSON.stringify(record, null, 2), "utf8");

      const index = await loadIndex();
      const entry: DatasetIndexEntry = {
        id: record.summary.id,
        name: record.summary.name,
        source: "bids",
        rootPath: record.summary.rootPath,
        filePath,
        registeredAt: record.summary.ingestedAt
      };

      await writeIndex([entry, ...index.filter((candidate) => candidate.id !== entry.id)]);
      return record;
    },

    async list(): Promise<IngestedDatasetSummary[]> {
      const index = await loadIndex();
      const records = await Promise.all(
        index.map(async (entry) => {
          const content = await readFile(entry.filePath, "utf8");
          const record = JSON.parse(content) as BidsDatasetRecord;
          return datasetSummarySchema.parse(record.summary) as IngestedDatasetSummary;
        })
      );
      return records.sort((left, right) => Date.parse(right.ingestedAt) - Date.parse(left.ingestedAt));
    },

    async get(datasetId: string): Promise<BidsDatasetRecord | null> {
      const index = await loadIndex();
      const match = index.find((entry) => entry.id === datasetId);
      if (!match) {
        return null;
      }

      const content = await readFile(match.filePath, "utf8");
      const record = JSON.parse(content) as BidsDatasetRecord;
      return {
        ...record,
        summary: datasetSummarySchema.parse(record.summary) as IngestedDatasetSummary
      };
    }
  };
}
