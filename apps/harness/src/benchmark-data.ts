import path from "node:path";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import type { BenchmarkPackId } from "@immaculate/core";

type OpenNeuroFileEntry = {
  id: string;
  filename: string;
  size: number;
  directory: boolean;
  annexed: boolean;
  urls: string[];
};

type BenchmarkDataSource = {
  provider: "fixture" | "openneuro" | "dandi";
  label: string;
  url: string;
  localPath: string;
};

export type ExternalNeurodataEvidence = {
  openNeuroDatasetId: string;
  openNeuroSnapshotTag: string;
  openNeuroFiles: number;
  openNeuroBytes: number;
  openNeuroSubject: string;
  openNeuroUrl: string;
  dandiDandisetId: string;
  dandiVersion: string;
  dandiAssetId: string;
  dandiAssetPath: string;
  dandiBytes: number;
  dandiUrl: string;
};

export type ResolvedBenchmarkInputs = {
  bidsPath: string;
  nwbPath: string;
  sources: BenchmarkDataSource[];
  externalNeurodata?: ExternalNeurodataEvidence;
};

const OPENNEURO_GRAPHQL_ENDPOINT = "https://openneuro.org/crn/graphql";
const OPENNEURO_DEFAULT_DATASET_ID =
  process.env.IMMACULATE_OPENNEURO_DATASET_ID?.trim() || "ds000001";
const OPENNEURO_DEFAULT_SNAPSHOT_TAG =
  process.env.IMMACULATE_OPENNEURO_SNAPSHOT_TAG?.trim() || "1.0.0";
const OPENNEURO_DEFAULT_SUBJECT =
  process.env.IMMACULATE_OPENNEURO_SUBJECT?.trim() || "sub-01";
const OPENNEURO_MAX_DOWNLOAD_BYTES = Number(
  process.env.IMMACULATE_OPENNEURO_MAX_BYTES ?? 128 * 1024 * 1024
);
const DANDI_API_ROOT = "https://api.dandiarchive.org/api";
const DANDI_DEFAULT_DANDISET_ID =
  process.env.IMMACULATE_DANDISET_ID?.trim() || "000023";
const EXTERNAL_DATASET_ROOT_DIRNAME = "external-datasets";
const execFileAsync = promisify(execFile);
const OPENNEURO_QUERY = `
  query BenchmarkSnapshotFiles($datasetId: ID!, $tag: String!, $tree: String) {
    snapshot(datasetId: $datasetId, tag: $tag) {
      files(tree: $tree) {
        id
        filename
        size
        directory
        annexed
        urls
      }
    }
  }
`;

type OpenNeuroTreeFile = {
  relativePath: string;
  size: number;
  url: string;
};

function dataRoot(runtimeDir: string): string {
  return path.join(runtimeDir, EXTERNAL_DATASET_ROOT_DIRNAME);
}

function encodeGraphqlBody(query: string, variables: Record<string, string | undefined>): string {
  return JSON.stringify({
    query,
    variables
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function existingFileMatches(filePath: string, expectedSize?: number): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return typeof expectedSize === "number" ? fileStat.size === expectedSize : fileStat.size > 0;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, destinationPath: string, expectedSize?: number): Promise<void> {
  if (await existingFileMatches(destinationPath, expectedSize)) {
    return;
  }

  await ensureParentDirectory(destinationPath);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destinationPath));
}

async function listOpenNeuroFiles(
  datasetId: string,
  snapshotTag: string,
  treeId?: string
): Promise<OpenNeuroFileEntry[]> {
  const response = await fetchJson<{
    data?: {
      snapshot?: {
        files?: OpenNeuroFileEntry[];
      };
    };
    errors?: Array<{ message?: string }>;
  }>(OPENNEURO_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: encodeGraphqlBody(OPENNEURO_QUERY, {
      datasetId,
      tag: snapshotTag,
      tree: treeId
    })
  });

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    throw new Error(response.errors.map((entry) => entry.message ?? "unknown_error").join("; "));
  }

  return response.data?.snapshot?.files ?? [];
}

function chooseSubjectDirectory(
  rootEntries: OpenNeuroFileEntry[],
  requestedSubject: string
): OpenNeuroFileEntry {
  const directories = rootEntries.filter((entry) => entry.directory);
  const explicit = directories.find((entry) => entry.filename === requestedSubject);
  if (explicit) {
    return explicit;
  }

  const firstSubject = directories.find((entry) => entry.filename.startsWith("sub-"));
  if (firstSubject) {
    return firstSubject;
  }

  throw new Error(`OpenNeuro dataset does not expose a subject directory for ${requestedSubject}.`);
}

function toOpenNeuroTreeFiles(prefix: string, entries: OpenNeuroFileEntry[]): OpenNeuroTreeFile[] {
  return entries
    .filter((entry) => !entry.directory && entry.urls[0])
    .map((entry) => ({
      relativePath: prefix ? `${prefix}/${entry.filename}` : entry.filename,
      size: entry.size,
      url: entry.urls[0]!
    }));
}

function takeCappedTreeFiles(
  entries: OpenNeuroTreeFile[],
  remainingBudget: number,
  maxFiles: number
): OpenNeuroTreeFile[] {
  const selected: OpenNeuroTreeFile[] = [];
  let used = 0;

  for (const entry of entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    if (selected.length >= maxFiles) {
      break;
    }
    if (used + entry.size > remainingBudget && selected.length > 0) {
      break;
    }
    selected.push(entry);
    used += entry.size;
  }

  return selected;
}

async function ensureOpenNeuroBenchmarkSlice(rootDir: string): Promise<{
  rootPath: string;
  datasetId: string;
  snapshotTag: string;
  subject: string;
  fileCount: number;
  sizeBytes: number;
  sourceUrl: string;
}> {
  const datasetId = OPENNEURO_DEFAULT_DATASET_ID;
  const snapshotTag = OPENNEURO_DEFAULT_SNAPSHOT_TAG;
  const requestedSubject = OPENNEURO_DEFAULT_SUBJECT;
  const localRoot = path.join(rootDir, `openneuro-${datasetId}-${snapshotTag}`);
  await mkdir(localRoot, { recursive: true });
  const gitDir = path.join(localRoot, ".git");
  if (!existsSync(gitDir)) {
    await execFileAsync("git", [
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      `https://github.com/OpenNeuroDatasets/${datasetId}.git`,
      localRoot
    ]);
  }
  await execFileAsync(
    "git",
    [
      "-C",
      localRoot,
      "sparse-checkout",
      "set",
      "--no-cone",
      "/dataset_description.json",
      "/participants.tsv",
      `/${requestedSubject}/anat`,
      `/${requestedSubject}/func`
    ],
    {
      maxBuffer: 1024 * 1024 * 16
    }
  );

  const allFiles = await execFileAsync(
    "git",
    ["-C", localRoot, "ls-files"],
    {
      maxBuffer: 1024 * 1024 * 16
    }
  );
  const relativeFiles = allFiles.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && existsSync(path.join(localRoot, line)));
  const fileStats = await Promise.all(
    relativeFiles.map(async (relativePath) => {
      const details = await stat(path.join(localRoot, relativePath));
      return {
        relativePath,
        size: details.size
      };
    })
  );

  return {
    rootPath: localRoot,
    datasetId,
    snapshotTag,
    subject: requestedSubject,
    fileCount: fileStats.length,
    sizeBytes: fileStats.reduce((sum, entry) => sum + entry.size, 0),
    sourceUrl: `https://openneuro.org/datasets/${datasetId}/versions/${snapshotTag}`
  };
}

type DandiRootResponse = {
  most_recent_published_version?: {
    version?: string;
  };
  draft_version?: {
    version?: string;
  };
};

type DandiAssetListingResponse = {
  next: string | null;
  results: Array<{
    asset_id: string;
    path: string;
    size: number;
  }>;
};

type DandiAssetResponse = {
  path: string;
  identifier: string;
  contentSize: number;
  contentUrl?: string[];
};

async function resolveDandiPublishedVersion(dandisetId: string): Promise<string> {
  const root = await fetchJson<DandiRootResponse>(`${DANDI_API_ROOT}/dandisets/${dandisetId}/`);
  return (
    root.most_recent_published_version?.version ??
    root.draft_version?.version ??
    "draft"
  );
}

async function findSmallestDandiAsset(
  dandisetId: string,
  version: string
): Promise<{ assetId: string; path: string; size: number }> {
  let nextUrl = `${DANDI_API_ROOT}/dandisets/${dandisetId}/versions/${version}/assets/?page_size=100&ordering=size`;
  let smallest: { assetId: string; path: string; size: number } | null = null;
  let pageCount = 0;

  while (nextUrl && pageCount < 4) {
    const page = await fetchJson<DandiAssetListingResponse>(nextUrl);
    for (const asset of page.results) {
      if (!asset.path.toLowerCase().endsWith(".nwb")) {
        continue;
      }
      if (!smallest || asset.size < smallest.size) {
        smallest = {
          assetId: asset.asset_id,
          path: asset.path,
          size: asset.size
        };
      }
    }
    nextUrl = page.next ?? "";
    pageCount += 1;
  }

  if (!smallest) {
    throw new Error(`Unable to locate a downloadable NWB asset in DANDI ${dandisetId}.`);
  }

  return smallest;
}

async function ensureDandiBenchmarkAsset(rootDir: string): Promise<{
  filePath: string;
  dandisetId: string;
  version: string;
  assetId: string;
  assetPath: string;
  sizeBytes: number;
  sourceUrl: string;
}> {
  const dandisetId = DANDI_DEFAULT_DANDISET_ID;
  const version = await resolveDandiPublishedVersion(dandisetId);
  const smallestAsset = await findSmallestDandiAsset(dandisetId, version);
  const asset = await fetchJson<DandiAssetResponse>(
    `${DANDI_API_ROOT}/dandisets/${dandisetId}/versions/${version}/assets/${smallestAsset.assetId}/`
  );
  const contentUrl = asset.contentUrl?.[0];
  if (!contentUrl) {
    throw new Error(`DANDI asset ${smallestAsset.assetId} does not expose a content URL.`);
  }

  const localPath = path.join(rootDir, `dandi-${dandisetId}-${version}`, smallestAsset.path);
  await downloadFile(contentUrl, localPath, asset.contentSize);

  return {
    filePath: localPath,
    dandisetId,
    version,
    assetId: smallestAsset.assetId,
    assetPath: smallestAsset.path,
    sizeBytes: asset.contentSize,
    sourceUrl: `https://dandiarchive.org/dandiset/${dandisetId}/${version}`
  };
}

export async function resolveBenchmarkInputs(
  packId: BenchmarkPackId,
  runtimeDir: string,
  defaults: {
    bidsFixturePath: string;
    nwbFixturePath: string;
  }
): Promise<ResolvedBenchmarkInputs> {
  if (packId !== "neurodata-external") {
    return {
      bidsPath: defaults.bidsFixturePath,
      nwbPath: defaults.nwbFixturePath,
      sources: [
        {
          provider: "fixture",
          label: "Fixture BIDS",
          url: `file://${defaults.bidsFixturePath.replace(/\\/g, "/")}`,
          localPath: defaults.bidsFixturePath
        },
        {
          provider: "fixture",
          label: "Fixture NWB",
          url: `file://${defaults.nwbFixturePath.replace(/\\/g, "/")}`,
          localPath: defaults.nwbFixturePath
        }
      ]
    };
  }

  const rootDir = dataRoot(runtimeDir);
  const [openNeuro, dandi] = await Promise.all([
    ensureOpenNeuroBenchmarkSlice(rootDir),
    ensureDandiBenchmarkAsset(rootDir)
  ]);

  return {
    bidsPath: openNeuro.rootPath,
    nwbPath: dandi.filePath,
    sources: [
      {
        provider: "openneuro",
        label: `OpenNeuro ${openNeuro.datasetId}:${openNeuro.snapshotTag}`,
        url: openNeuro.sourceUrl,
        localPath: openNeuro.rootPath
      },
      {
        provider: "dandi",
        label: `DANDI ${dandi.dandisetId}:${dandi.version}`,
        url: dandi.sourceUrl,
        localPath: dandi.filePath
      }
    ],
    externalNeurodata: {
      openNeuroDatasetId: openNeuro.datasetId,
      openNeuroSnapshotTag: openNeuro.snapshotTag,
      openNeuroFiles: openNeuro.fileCount,
      openNeuroBytes: openNeuro.sizeBytes,
      openNeuroSubject: openNeuro.subject,
      openNeuroUrl: openNeuro.sourceUrl,
      dandiDandisetId: dandi.dandisetId,
      dandiVersion: dandi.version,
      dandiAssetId: dandi.assetId,
      dandiAssetPath: dandi.assetPath,
      dandiBytes: dandi.sizeBytes,
      dandiUrl: dandi.sourceUrl
    }
  };
}
