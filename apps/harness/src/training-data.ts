import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  trainingCorpusManifestSchema,
  trainingCorpusRunSchema,
  trainingCorpusRunSummarySchema,
  type TrainingCorpusCurationStatus,
  type TrainingCorpusFileRecord,
  type TrainingCorpusManifest,
  type TrainingCorpusOutputShard,
  type TrainingCorpusRun,
  type TrainingCorpusRunSummary,
  type TrainingCorpusSecretScanStatus,
  type TrainingCorpusSourceHost,
  type TrainingCorpusSourceManifest,
  type TrainingCorpusSourceSummary
} from "@immaculate/core";
import { hashValue, resolvePathWithinAllowedRoot, safeUnlink } from "./utils.js";

const execFileAsync = promisify(execFile);

const TRAINING_DATA_DIR = "training-data";
const RUNS_DIR = "runs";
const INDEX_PATH = "index.json";

type CurateTrainingCorpusOptions = {
  manifestPath: string;
  outputRoot: string;
  actor?: string;
};

type TrainingCorpusRegistryEntry = {
  id: string;
  manifestName: string;
  createdAt: string;
  filePath: string;
};

type TrainingCorpusExportRecord = {
  id: string;
  sourceId: string;
  host: TrainingCorpusSourceHost;
  resolvedRef?: string;
  relativePath: string;
  language: string;
  tags: string[];
  detectedLicense?: string;
  contentFingerprint: string;
  content: string;
  provenanceRecordId: string;
};

type SourceMaterialization = {
  source: TrainingCorpusSourceManifest;
  workingPath: string;
  locationLabel: string;
  resolvedRef?: string;
};

function gitCommandArgs(args: string[]): string[] {
  if (process.platform !== "win32") {
    return args;
  }
  return ["-c", "core.longpaths=true", ...args];
}

type ScannedFile = {
  relativePath: string;
  sizeBytes: number;
  lineCount: number;
  language: string;
  tags: string[];
  rawHash: string;
  contentFingerprint: string;
  dedupKey: string;
  text: string;
  secretFindingCount: number;
  secretScanStatus: TrainingCorpusSecretScanStatus;
  curationStatus: TrainingCorpusCurationStatus;
  skipReason?: string;
};

type SourceEvaluation = {
  summary: TrainingCorpusSourceSummary;
  files: TrainingCorpusFileRecord[];
  exportRecords: TrainingCorpusExportRecord[];
};

const LICENSE_TEXT_PATTERNS: Array<{ spdxId: string; pattern: RegExp }> = [
  {
    spdxId: "MIT",
    pattern: /permission is hereby granted,\s*free of charge,\s*to any person obtaining a copy/i
  },
  {
    spdxId: "Apache-2.0",
    pattern: /apache license[\s\S]{0,80}version 2\.0/i
  },
  {
    spdxId: "BSD-3-Clause",
    pattern:
      /redistribution and use in source and binary forms[\s\S]{0,400}neither the name of/i
  },
  {
    spdxId: "BSD-2-Clause",
    pattern: /redistribution and use in source and binary forms[\s\S]{0,400}disclaimer/i
  },
  {
    spdxId: "ISC",
    pattern:
      /permission to use,\s*copy,\s*modify,\s*and\/or distribute this software for any purpose/i
  },
  {
    spdxId: "MPL-2.0",
    pattern: /mozilla public license[\s\S]{0,80}version 2\.0/i
  },
  {
    spdxId: "LGPL-3.0",
    pattern: /gnu lesser general public license/i
  },
  {
    spdxId: "AGPL-3.0",
    pattern: /gnu affero general public license/i
  },
  {
    spdxId: "GPL-3.0",
    pattern: /gnu general public license/i
  }
];

const SECRET_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  {
    id: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,255}\b/g
  },
  {
    id: "github-pat",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g
  },
  {
    id: "wandb-token",
    pattern: /\bwandb_v1_[A-Za-z0-9_]{20,255}\b/g
  },
  {
    id: "openai-key",
    pattern: /\bsk-[A-Za-z0-9]{20,255}\b/g
  },
  {
    id: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g
  },
  {
    id: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  },
  {
    id: "generic-secret-assignment",
    pattern:
      /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][A-Za-z0-9_\-+=/]{16,}["']/gi
  }
];

const MULTI_TAG_SHARDS: Array<{
  id: string;
  label: string;
  tags: string[];
}> = [
  {
    id: "coding",
    label: "Coding corpus",
    tags: ["code", "tests"]
  },
  {
    id: "security",
    label: "Defensive security corpus",
    tags: ["security"]
  },
  {
    id: "ops",
    label: "Ops and infra corpus",
    tags: ["ops", "infra", "ci"]
  },
  {
    id: "docs",
    label: "Documentation corpus",
    tags: ["docs"]
  }
];

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function blake2_256Hex(value: string | Buffer): string {
  return createHash("blake2b512").update(value).digest("hex").slice(0, 64);
}

function sanitizeRemoteLocation(location: string): string {
  try {
    const parsed = new URL(location);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return location;
  }
}

function sanitizeLocationLabel(host: TrainingCorpusSourceHost, location: string): string {
  if (host === "local") {
    return `local:${path.basename(location) || normalizePath(location)}`;
  }
  const sanitized = sanitizeRemoteLocation(location);
  try {
    const parsed = new URL(sanitized);
    return `${parsed.hostname}${parsed.pathname.replace(/\.git$/i, "")}`;
  } catch {
    return sanitized;
  }
}

function shouldTreatAsCopyleft(licenseId: string | undefined): boolean {
  const normalized = licenseId?.toLowerCase() ?? "";
  return normalized.includes("gpl") || normalized.includes("agpl") || normalized.includes("lgpl");
}

function looksProprietaryGenerated(source: TrainingCorpusSourceManifest): boolean {
  const combined = [
    source.id,
    source.location,
    source.description ?? "",
    ...source.tags
  ]
    .join(" ")
    .toLowerCase();
  return (
    combined.includes("gpt") ||
    combined.includes("claude") ||
    combined.includes("alpaca") ||
    combined.includes("synthetic") ||
    combined.includes("generated")
  );
}

function normalizeTextForHash(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function buildDedupKey(text: string): string {
  const normalized = normalizeTextForHash(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return sha256Hex(normalized);
}

function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const probe = buffer.subarray(0, Math.min(buffer.length, 1024));
  for (const value of probe) {
    if (value === 0) {
      return true;
    }
  }
  return false;
}

function classifyLanguage(relativePath: string): string {
  const normalized = normalizePath(relativePath);
  const basename = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized).toLowerCase();
  if (basename === "Dockerfile" || extension === ".dockerfile") {
    return "dockerfile";
  }
  if (basename === "Makefile") {
    return "make";
  }
  if (basename === "Jenkinsfile") {
    return "groovy";
  }
  if (basename === ".gitlab-ci.yml" || normalized.startsWith(".github/workflows/")) {
    return "yaml";
  }

  const languageMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".scala": "scala",
    ".c": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".md": "markdown",
    ".mdx": "markdown",
    ".json": "json",
    ".jsonc": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".ini": "ini",
    ".sql": "sql",
    ".rego": "rego",
    ".tf": "terraform",
    ".tfvars": "terraform",
    ".bicep": "bicep",
    ".sh": "shell",
    ".ps1": "powershell",
    ".xml": "xml",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".proto": "proto",
    ".txt": "text"
  };
  return languageMap[extension] ?? "text";
}

function classifyTags(relativePath: string, language: string): string[] {
  const normalized = normalizePath(relativePath).toLowerCase();
  const tags = new Set<string>();
  if (
    normalized.includes("/test") ||
    normalized.includes("/tests/") ||
    normalized.includes("__tests__") ||
    normalized.includes(".spec.") ||
    normalized.includes(".test.")
  ) {
    tags.add("tests");
  }
  if (
    normalized.startsWith("docs/") ||
    normalized.includes("/docs/") ||
    language === "markdown"
  ) {
    tags.add("docs");
  }
  if (
    normalized.startsWith(".github/workflows/") ||
    normalized.includes(".gitlab-ci") ||
    normalized.includes("jenkinsfile")
  ) {
    tags.add("ci");
    tags.add("ops");
  }
  if (
    normalized.includes("terraform") ||
    normalized.includes("helm") ||
    normalized.includes("k8s") ||
    normalized.includes("kubernetes") ||
    normalized.endsWith(".tf") ||
    normalized.endsWith(".tfvars") ||
    normalized.endsWith("dockerfile") ||
    normalized.endsWith(".bicep")
  ) {
    tags.add("infra");
    tags.add("ops");
  }
  if (
    normalized.includes("security") ||
    normalized.includes("policy") ||
    normalized.includes("rego") ||
    normalized.includes("semgrep") ||
    normalized.includes("sast") ||
    normalized.includes("trivy") ||
    normalized.includes("falco")
  ) {
    tags.add("security");
  }
  if (tags.size === 0 || (!tags.has("docs") && !tags.has("infra") && !tags.has("ci"))) {
    tags.add("code");
  }
  return [...tags];
}

function countSecretFindings(text: string): number {
  return SECRET_PATTERNS.reduce((total, entry) => total + (text.match(entry.pattern)?.length ?? 0), 0);
}

function fileNameIncluded(
  relativePath: string,
  manifest: TrainingCorpusManifest
): boolean {
  const normalized = normalizePath(relativePath);
  const basename = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized).toLowerCase();
  if (manifest.policy.includeFileNames.includes(basename)) {
    return true;
  }
  if (manifest.policy.includeExtensions.includes(extension)) {
    return true;
  }
  return basename.toLowerCase() === "dockerfile";
}

function fileNameExcluded(
  relativePath: string,
  manifest: TrainingCorpusManifest
): boolean {
  const normalized = normalizePath(relativePath);
  const basename = path.posix.basename(normalized).toLowerCase();
  const lowerPath = normalized.toLowerCase();
  if (
    lowerPath
      .split("/")
      .some((segment) =>
        manifest.policy.excludeDirectories.map((entry) => entry.toLowerCase()).includes(segment)
      )
  ) {
    return true;
  }
  return manifest.policy.excludeFilePatterns.some((pattern) => {
    const normalizedPattern = pattern.toLowerCase();
    return basename.endsWith(normalizedPattern) || lowerPath.endsWith(normalizedPattern);
  });
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  } finally {
    await safeUnlink(tempPath);
  }
}

async function safeRead(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function directoryNameExcluded(name: string, manifest: TrainingCorpusManifest): boolean {
  const normalizedName = name.toLowerCase();
  return manifest.policy.excludeDirectories.some(
    (entry) => entry.toLowerCase() === normalizedName
  );
}

async function walkFiles(
  rootPath: string,
  manifest: TrainingCorpusManifest,
  limit = Number.POSITIVE_INFINITY
): Promise<string[]> {
  const files: string[] = [];

  async function visit(currentPath: string): Promise<void> {
    if (files.length >= limit) {
      return;
    }

    const entries = (await readdir(currentPath, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name)
    );

    for (const entry of entries) {
      if (files.length >= limit) {
        return;
      }

      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!directoryNameExcluded(entry.name, manifest)) {
          await visit(fullPath);
        }
        continue;
      }
      files.push(fullPath);
    }
  }

  await visit(rootPath);
  return files;
}

async function detectLicense(rootPath: string): Promise<string | undefined> {
  const packageJsonPath = path.join(rootPath, "package.json");
  const pyprojectPath = path.join(rootPath, "pyproject.toml");
  const cargoPath = path.join(rootPath, "Cargo.toml");
  const licenseFiles = [
    "LICENSE",
    "LICENSE.txt",
    "LICENSE.md",
    "COPYING",
    "COPYING.txt",
    "NOTICE"
  ];

  for (const candidatePath of [packageJsonPath, pyprojectPath, cargoPath]) {
    const content = await safeRead(candidatePath);
    if (!content) {
      continue;
    }
    if (candidatePath.endsWith("package.json")) {
      try {
        const parsed = JSON.parse(content) as { license?: string };
        if (typeof parsed.license === "string" && parsed.license.trim()) {
          return parsed.license.trim();
        }
      } catch {
        // Ignore malformed package metadata.
      }
    }
    const match = content.match(/^\s*license\s*=\s*["']([^"']+)["']/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  for (const licenseFile of licenseFiles) {
    const content = await safeRead(path.join(rootPath, licenseFile));
    if (!content) {
      continue;
    }
    for (const entry of LICENSE_TEXT_PATTERNS) {
      if (entry.pattern.test(content)) {
        return entry.spdxId;
      }
    }
  }

  return undefined;
}

async function resolveGitRef(rootPath: string, ref?: string): Promise<string | undefined> {
  try {
    const result = await execFileAsync(
      "git",
      gitCommandArgs(["-C", rootPath, "rev-parse", ref?.trim() || "HEAD"]),
      { maxBuffer: 1024 * 1024 * 4 }
    );
    return result.stdout.trim() || undefined;
  } catch {
    return ref?.trim() || undefined;
  }
}

async function materializeSource(
  source: TrainingCorpusSourceManifest,
  sourcesRoot: string
): Promise<SourceMaterialization> {
  if (source.host === "local") {
    const workingPath = resolvePathWithinAllowedRoot(source.location);
    const details = await lstat(workingPath);
    if (!details.isDirectory()) {
      throw new Error(`Local source ${source.id} must point to a directory.`);
    }
    return {
      source,
      workingPath,
      locationLabel: sanitizeLocationLabel(source.host, workingPath),
      resolvedRef: await resolveGitRef(workingPath, source.ref)
    };
  }

  const sourceRoot = path.join(sourcesRoot, `${source.id}-${hashValue(source.location)}`);
  await mkdir(path.dirname(sourceRoot), { recursive: true });
  await execFileAsync("git", gitCommandArgs(["clone", "--depth", "1", source.location, sourceRoot]), {
    maxBuffer: 1024 * 1024 * 16
  });
  if (source.ref?.trim()) {
    await execFileAsync("git", gitCommandArgs(["-C", sourceRoot, "checkout", source.ref.trim()]), {
      maxBuffer: 1024 * 1024 * 16
    });
  }
  return {
    source,
    workingPath: sourceRoot,
    locationLabel: sanitizeLocationLabel(source.host, source.location),
    resolvedRef: await resolveGitRef(sourceRoot)
  };
}

function decideLicense(
  manifest: TrainingCorpusManifest,
  detectedLicense: string | undefined
): TrainingCorpusSourceSummary["licenseDecision"] {
  if (!detectedLicense) {
    return "reject";
  }
  if (manifest.policy.allowedLicenses.includes(detectedLicense)) {
    return "allow";
  }
  if (manifest.policy.reviewLicenses.includes(detectedLicense)) {
    return "review";
  }
  return "reject";
}

async function buildPipelineCodeSha256(): Promise<string> {
  const content = await readFile(new URL(import.meta.url), "utf8");
  return sha256Hex(content);
}

async function scanSourceFiles(
  source: SourceMaterialization,
  manifest: TrainingCorpusManifest,
  detectedLicense: string | undefined,
  dedupKeys: Set<string>,
  previousProvenanceRecordId?: string
): Promise<SourceEvaluation> {
  const filesOnDisk = (
    await walkFiles(
      source.workingPath,
      manifest,
      manifest.policy.maxFilesPerSource ?? Number.POSITIVE_INFINITY
    )
  ).sort((left, right) => left.localeCompare(right));
  const scannedFiles: ScannedFile[] = [];

  for (const filePath of filesOnDisk) {
    const details = await lstat(filePath);
    if (!details.isFile()) {
      continue;
    }
    const relativePath = normalizePath(path.relative(source.workingPath, filePath));
    if (fileNameExcluded(relativePath, manifest) || !fileNameIncluded(relativePath, manifest)) {
      continue;
    }
    const language = classifyLanguage(relativePath);
    const tags = classifyTags(relativePath, language);
    if (details.size > manifest.policy.maxFileBytes) {
      scannedFiles.push({
        relativePath,
        sizeBytes: details.size,
        lineCount: 0,
        language,
        tags,
        rawHash: sha256Hex(`${relativePath}:${details.size}`),
        contentFingerprint: sha256Hex(`${relativePath}:skipped:too-large`),
        dedupKey: sha256Hex(`${relativePath}:skipped:too-large`),
        text: "",
        secretFindingCount: 0,
        secretScanStatus: "not-scanned",
        curationStatus: "skipped",
        skipReason: "file_too_large"
      });
      continue;
    }

    const buffer = await readFile(filePath);
    if (isBinaryBuffer(buffer)) {
      continue;
    }

    const text = buffer.toString("utf8");
    const secretFindingCount = manifest.policy.secretScanningEnabled
      ? countSecretFindings(text)
      : 0;
    const dedupKey = buildDedupKey(text);
    const duplicate = manifest.policy.deduplicate && dedupKeys.has(dedupKey);
    if (!duplicate && manifest.policy.deduplicate) {
      dedupKeys.add(dedupKey);
    }
    const contentFingerprint = sha256Hex(normalizeTextForHash(text));
    const lineCount = text.length > 0 ? text.split(/\r?\n/).length : 0;

    scannedFiles.push({
      relativePath,
      sizeBytes: details.size,
      lineCount,
      language,
      tags,
      rawHash: sha256Hex(buffer),
      contentFingerprint,
      dedupKey,
      text,
      secretFindingCount,
      secretScanStatus:
        !manifest.policy.secretScanningEnabled
          ? "not-scanned"
          : secretFindingCount > 0
            ? "flagged"
            : "clear",
      curationStatus:
        secretFindingCount > 0
          ? "skipped"
          : duplicate
            ? "duplicate"
            : "accepted",
      skipReason:
        secretFindingCount > 0
          ? "secret_detected"
          : duplicate
            ? "duplicate_content"
            : undefined
    });
  }

  const acceptedFiles = scannedFiles.filter((file) => file.curationStatus === "accepted");
  const rawContentSha256 = sha256Hex(
    JSON.stringify(
      scannedFiles.map((file) => ({
        relativePath: file.relativePath,
        rawHash: file.rawHash,
        sizeBytes: file.sizeBytes
      }))
    )
  );
  const processedContentSha256 = sha256Hex(
    JSON.stringify(
      acceptedFiles.map((file) => ({
        relativePath: file.relativePath,
        contentFingerprint: file.contentFingerprint
      }))
    )
  );
  const estimatedTokenCount = acceptedFiles.reduce(
    (total, file) => total + estimateTokenCount(file.text),
    0
  );
  const licenseDecision = decideLicense(manifest, detectedLicense);
  const provenanceRecordId = `prov-${hashValue(`${source.source.id}:${processedContentSha256}`)}`;
  const sourceSummary: TrainingCorpusSourceSummary = {
    sourceId: source.source.id,
    kind: source.source.kind,
    host: source.source.host,
    locationLabel: source.locationLabel,
    provenanceRecordId,
    resolvedRef: source.resolvedRef,
    detectedLicense,
    expectedLicense: source.source.expectedLicense,
    licenseDecision,
    status: licenseDecision === "allow" ? "accepted" : "rejected",
    acceptedFileCount: licenseDecision === "allow" ? acceptedFiles.length : 0,
    skippedFileCount:
      licenseDecision === "allow"
        ? scannedFiles.filter((file) => file.curationStatus === "skipped").length
        : scannedFiles.length,
    duplicateFileCount: scannedFiles.filter((file) => file.curationStatus === "duplicate").length,
    secretFindingCount: scannedFiles.reduce(
      (total, file) => total + file.secretFindingCount,
      0
    ),
    rawContentSha256,
    processedContentSha256,
    estimatedTokenCount: licenseDecision === "allow" ? estimatedTokenCount : 0,
    commercialUse: licenseDecision === "allow",
    defenseUse: licenseDecision === "allow",
    copyleftFree: !shouldTreatAsCopyleft(detectedLicense),
    gptOutputFree: !looksProprietaryGenerated(source.source),
    previousProvenanceRecordId,
    provenanceChainHash: blake2_256Hex(
      [
        previousProvenanceRecordId ?? "",
        provenanceRecordId,
        processedContentSha256,
        source.resolvedRef ?? "",
        detectedLicense ?? "",
        source.locationLabel
      ].join("|")
    ),
    rationale:
      licenseDecision === "allow"
        ? `license=${detectedLicense ?? "unknown"} / files=${acceptedFiles.length} / secrets=${scannedFiles.reduce((total, file) => total + file.secretFindingCount, 0)}`
        : `license=${detectedLicense ?? "unknown"} rejected by policy`
  };

  const files: TrainingCorpusFileRecord[] = scannedFiles.map((file) => ({
    sourceId: source.source.id,
    relativePath: file.relativePath,
    language: file.language,
    tags: file.tags,
    sizeBytes: file.sizeBytes,
    lineCount: file.lineCount,
    detectedLicense,
    contentFingerprint: file.contentFingerprint,
    dedupKey: file.dedupKey,
    secretScanStatus: file.secretScanStatus,
    curationStatus:
      licenseDecision === "allow" ? file.curationStatus : "rejected",
    skipReason:
      licenseDecision === "allow"
        ? file.skipReason
        : file.skipReason ?? "source_license_rejected",
    secretFindingCount: file.secretFindingCount
  }));

  const exportRecords: TrainingCorpusExportRecord[] =
    licenseDecision === "allow"
      ? acceptedFiles.map((file) => ({
          id: `record-${hashValue(`${source.source.id}:${file.relativePath}:${file.contentFingerprint}`)}`,
          sourceId: source.source.id,
          host: source.source.host,
          resolvedRef: source.resolvedRef,
          relativePath: file.relativePath,
          language: file.language,
          tags: file.tags,
          detectedLicense,
          contentFingerprint: file.contentFingerprint,
          content: file.text,
          provenanceRecordId
        }))
      : [];

  return {
    summary: sourceSummary,
    files,
    exportRecords
  };
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n").concat(rows.length > 0 ? "\n" : ""),
    "utf8"
  );
}

function buildShards(
  runRoot: string,
  exportRecords: TrainingCorpusExportRecord[]
): Array<TrainingCorpusOutputShard & { records: TrainingCorpusExportRecord[] }> {
  return MULTI_TAG_SHARDS.map((shard) => {
    const records = exportRecords.filter((record) =>
      shard.tags.some((tag) => record.tags.includes(tag))
    );
    return {
      id: shard.id,
      label: shard.label,
      filePath: path.join(runRoot, "shards", `${shard.id}.jsonl`),
      recordCount: records.length,
      tags: shard.tags,
      records
    };
  }).filter((shard) => shard.recordCount > 0);
}

export async function loadTrainingCorpusManifest(
  manifestPath: string
): Promise<TrainingCorpusManifest> {
  const resolvedPath = resolvePathWithinAllowedRoot(manifestPath);
  const content = await readFile(resolvedPath, "utf8");
  return trainingCorpusManifestSchema.parse(JSON.parse(content)) as TrainingCorpusManifest;
}

export async function curateTrainingCorpus(
  options: CurateTrainingCorpusOptions
): Promise<TrainingCorpusRun> {
  const manifestPath = resolvePathWithinAllowedRoot(options.manifestPath);
  const outputRoot = resolvePathWithinAllowedRoot(options.outputRoot);
  const manifest = await loadTrainingCorpusManifest(manifestPath);
  const runId = `cur-${hashValue(`${manifest.id}:${Date.now()}:${randomUUID()}`)}`;
  const runRoot = path.join(outputRoot, TRAINING_DATA_DIR, RUNS_DIR, runId);
  const sourcesRoot = path.join(runRoot, "sources");
  await mkdir(sourcesRoot, { recursive: true });

  const dedupKeys = new Set<string>();
  const sourceEvaluations: SourceEvaluation[] = [];
  let previousProvenanceRecordId: string | undefined;

  for (const source of manifest.sources) {
    if (!manifest.policy.allowedHosts.includes(source.host)) {
      sourceEvaluations.push({
        summary: {
          sourceId: source.id,
          kind: source.kind,
          host: source.host,
          locationLabel: sanitizeLocationLabel(source.host, source.location),
          provenanceRecordId: `prov-${hashValue(`${source.id}:blocked-host`)}`,
          detectedLicense: undefined,
          expectedLicense: source.expectedLicense,
          licenseDecision: "reject",
          status: "rejected",
          acceptedFileCount: 0,
          skippedFileCount: 0,
          duplicateFileCount: 0,
          secretFindingCount: 0,
          rawContentSha256: sha256Hex(source.location),
          processedContentSha256: sha256Hex(`${source.location}:rejected`),
          estimatedTokenCount: 0,
          commercialUse: false,
          defenseUse: false,
          copyleftFree: true,
          gptOutputFree: !looksProprietaryGenerated(source),
          provenanceChainHash: blake2_256Hex(source.location),
          rationale: `host=${source.host} rejected by policy`
        },
        files: [],
        exportRecords: []
      });
      continue;
    }

    const materialized = await materializeSource(source, sourcesRoot);
    const detectedLicense = await detectLicense(materialized.workingPath);
    const evaluation = await scanSourceFiles(
      materialized,
      manifest,
      detectedLicense,
      dedupKeys,
      previousProvenanceRecordId
    );
    previousProvenanceRecordId = evaluation.summary.provenanceRecordId;
    sourceEvaluations.push(evaluation);
  }

  const exportRecords = sourceEvaluations.flatMap((evaluation) => evaluation.exportRecords);
  const files = sourceEvaluations.flatMap((evaluation) => evaluation.files);
  const shards = buildShards(runRoot, exportRecords);
  const outputJsonlPath = path.join(runRoot, "curated-records.jsonl");
  await writeJsonl(outputJsonlPath, exportRecords);
  for (const shard of shards) {
    await writeJsonl(shard.filePath, shard.records);
  }

  const pipelineCodeSha256 = await buildPipelineCodeSha256();
  const run = trainingCorpusRunSchema.parse({
    id: runId,
    manifestId: manifest.id,
    manifestName: manifest.name,
    createdAt: new Date().toISOString(),
    createdBy: options.actor ?? manifest.createdBy,
    pipelineCodeSha256,
    sourceCount: manifest.sources.length,
    acceptedSourceCount: sourceEvaluations.filter(
      (evaluation) => evaluation.summary.status === "accepted"
    ).length,
    rejectedSourceCount: sourceEvaluations.filter(
      (evaluation) => evaluation.summary.status === "rejected"
    ).length,
    acceptedFileCount: files.filter((file) => file.curationStatus === "accepted").length,
    skippedFileCount: files.filter((file) => file.curationStatus === "skipped").length,
    duplicateFileCount: files.filter((file) => file.curationStatus === "duplicate").length,
    secretFindingCount: files.reduce((total, file) => total + file.secretFindingCount, 0),
    outputRecordCount: exportRecords.length,
    estimatedTokenCount: sourceEvaluations.reduce(
      (total, evaluation) => total + evaluation.summary.estimatedTokenCount,
      0
    ),
    commercialUse: sourceEvaluations.every((evaluation) => evaluation.summary.commercialUse),
    defenseUse: sourceEvaluations.every((evaluation) => evaluation.summary.defenseUse),
    copyleftFree: sourceEvaluations.every((evaluation) => evaluation.summary.copyleftFree),
    gptOutputFree: sourceEvaluations.every((evaluation) => evaluation.summary.gptOutputFree),
    provenanceChainHash: blake2_256Hex(
      sourceEvaluations.map((evaluation) => evaluation.summary.provenanceChainHash).join("|")
    ),
    outputRoot: runRoot,
    outputJsonlPath,
    shards: shards.map((shard) => ({
      id: shard.id,
      label: shard.label,
      filePath: shard.filePath,
      recordCount: shard.recordCount,
      tags: shard.tags
    })),
    sources: sourceEvaluations.map((evaluation) => evaluation.summary),
    manifestPath,
    manifest,
    files
  }) as TrainingCorpusRun;

  await mkdir(runRoot, { recursive: true });
  await writeJsonAtomic(path.join(runRoot, "manifest.resolved.json"), manifest);
  await writeJsonAtomic(path.join(runRoot, "run.json"), run);
  return run;
}

export function createTrainingCorpusRegistry(rootDir: string) {
  const registryRoot = path.join(rootDir, TRAINING_DATA_DIR);
  const indexPath = path.join(registryRoot, INDEX_PATH);

  async function loadIndex(): Promise<TrainingCorpusRegistryEntry[]> {
    const content = await safeRead(indexPath);
    if (!content) {
      return [];
    }
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const candidate = entry as Partial<TrainingCorpusRegistryEntry>;
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.manifestName !== "string" ||
          typeof candidate.createdAt !== "string" ||
          typeof candidate.filePath !== "string"
        ) {
          return [];
        }
        return [
          {
            id: candidate.id,
            manifestName: candidate.manifestName,
            createdAt: candidate.createdAt,
            filePath: candidate.filePath
          }
        ];
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async function writeIndex(entries: TrainingCorpusRegistryEntry[]): Promise<void> {
    await mkdir(registryRoot, { recursive: true });
    await writeJsonAtomic(indexPath, entries);
  }

  return {
    async register(run: TrainingCorpusRun): Promise<TrainingCorpusRun> {
      const parsedRun = trainingCorpusRunSchema.parse(run) as TrainingCorpusRun;
      const runPath = path.join(registryRoot, RUNS_DIR, parsedRun.id, "run.json");
      await writeJsonAtomic(runPath, parsedRun);
      const index = await loadIndex();
      const nextEntry: TrainingCorpusRegistryEntry = {
        id: parsedRun.id,
        manifestName: parsedRun.manifestName,
        createdAt: parsedRun.createdAt,
        filePath: runPath
      };
      await writeIndex([
        nextEntry,
        ...index.filter((entry) => entry.id !== parsedRun.id)
      ]);
      return parsedRun;
    },

    async list(): Promise<TrainingCorpusRunSummary[]> {
      const index = await loadIndex();
      const summaries = await Promise.all(
        index.map(async (entry) => {
          const content = await readFile(entry.filePath, "utf8");
          const parsed = trainingCorpusRunSchema.parse(JSON.parse(content)) as TrainingCorpusRun;
          return trainingCorpusRunSummarySchema.parse(parsed) as TrainingCorpusRunSummary;
        })
      );
      return summaries.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    },

    async get(runId: string): Promise<TrainingCorpusRun | null> {
      const index = await loadIndex();
      const match = index.find((entry) => entry.id === runId);
      if (!match) {
        return null;
      }
      const content = await readFile(match.filePath, "utf8");
      return trainingCorpusRunSchema.parse(JSON.parse(content)) as TrainingCorpusRun;
    }
  };
}
