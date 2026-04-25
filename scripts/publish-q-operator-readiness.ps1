param(
  [string]$ReceiptPath = ".runtime\q-operator-readiness\latest.json",
  [string]$OutputJsonPath = "docs\wiki\Q-Operator-Readiness.json",
  [string]$OutputMarkdownPath = "docs\wiki\Q-Operator-Readiness.md"
)

$ErrorActionPreference = "Stop"

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Readiness receipt not found: $Path"
  }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Remove-PrivateText {
  param([AllowNull()][string]$Text)
  if (-not $Text) {
    return $Text
  }
  $sanitized = $Text
  $sanitized = $sanitized.Replace(([string][char]0x00C2 + [string][char]0x00B7), "-")
  $sanitized = $sanitized.Replace([string][char]0x00B7, "-")
  $sanitized = $sanitized -replace '[A-Za-z]:\\[^\s`]+', '[local-path]'
  $sanitized = $sanitized -replace 'https?://(?:127\.0\.0\.1|localhost):\d+(?:/[^\s`]*)?', '[local-loopback]'
  $sanitized = $sanitized -replace 'C:\\Users\\Knight', '[local-profile]'
  return $sanitized.Trim()
}

function Convert-Finding {
  param([object]$Finding)
  return [ordered]@{
    id = $Finding.id
    severity = $Finding.severity
    area = $Finding.area
    summary = Remove-PrivateText $Finding.summary
    nextAction = Remove-PrivateText $Finding.nextAction
    blocksPublicProduction = [bool]$Finding.blocksPublicProduction
    blocksPrivateProduction = [bool]$Finding.blocksPrivateProduction
    blocksVoiceProduction = [bool]$Finding.blocksVoiceProduction
    blocksBenchmarkPublication = [bool]$Finding.blocksBenchmarkPublication
  }
}

function Convert-RuntimeWarning {
  param([object]$Warning)
  return [ordered]@{
    id = $Warning.id
    summary = Remove-PrivateText $Warning.summary
    detail = Remove-PrivateText $Warning.detail
  }
}

$receipt = Read-JsonFile $ReceiptPath

$publicSummary = [ordered]@{
  schemaVersion = 1
  generatedAt = $receipt.generatedAt
  currentUtcDate = $receipt.currentUtcDate
  currentDate = $receipt.currentDate
  qKnowledgeHorizon = $receipt.qFreshness.expectedKnowledgeHorizon
  qFreshnessRule = $receipt.qFreshness.rule
  productionGates = $receipt.productionGates
  publicSafety = [ordered]@{
    publicInfoHttpStatus = $receipt.arobiPublicSafety.publicInfoProbe.httpCode
    privateAuditPublicHttpStatus = $receipt.arobiPublicSafety.privateAuditProbe.httpCode
    publicProjectionGuard = $receipt.arobiPublicSafety.publicProjectionGuard.status
  }
  benchmarks = [ordered]@{
    immaculateLatestPresent = [bool]$receipt.benchmarkReceipts.immaculateLatestPresent
    bridgeBenchPresent = [bool]$receipt.benchmarkReceipts.bridgeBenchPresent
    terminalBenchLeaderboardStatus = $receipt.benchmarkReceipts.terminalBenchLeaderboardStatus
    qBenchmarkCorpusRecords = $receipt.benchmarkReceipts.qBenchmarkCorpusRecords
  }
  openJawsRuntime = [ordered]@{
    status = $receipt.openJawsRuntime.status
    summary = Remove-PrivateText $receipt.openJawsRuntime.summary
    okCount = $receipt.openJawsRuntime.okCount
    warningCount = $receipt.openJawsRuntime.warningCount
    failedCount = $receipt.openJawsRuntime.failedCount
    warnings = @($receipt.openJawsRuntime.warnings | ForEach-Object { Convert-RuntimeWarning $_ })
  }
  findings = @($receipt.findings | ForEach-Object { Convert-Finding $_ })
  publicationBoundary = "Public-safe summary only. Raw runtime receipts, local paths, private ledgers, tokens, and private routing details are not included."
}

$jsonParent = Split-Path -Parent $OutputJsonPath
$markdownParent = Split-Path -Parent $OutputMarkdownPath
New-Item -ItemType Directory -Force -Path $jsonParent | Out-Null
New-Item -ItemType Directory -Force -Path $markdownParent | Out-Null

$publicSummary | ConvertTo-Json -Depth 12 | Set-Content -Path $OutputJsonPath -Encoding UTF8

$gate = $publicSummary.productionGates
$markdownLines = @(
  "# Q Operator Readiness",
  "",
  "Public-safe operator readiness summary for Immaculate, Q, OpenJaws, and the Arobi public safety lane.",
  "",
  "- Generated: $($publicSummary.generatedAt)",
  "- Current UTC date: $($publicSummary.currentUtcDate)",
  "- Q knowledge horizon: $($publicSummary.qKnowledgeHorizon)",
  "- Public safety ready: $($gate.publicSafetyReady)",
  "- Private runtime ready: $($gate.privateRuntimeReady)",
  "- Voice ready: $($gate.voiceReady)",
  "- Benchmark publication ready: $($gate.benchmarkPublicationReady)",
  "- Critical findings: $($gate.criticalCount)",
  "- Warning findings: $($gate.warningCount)",
  "",
  "## Public Safety",
  "",
  "- Arobi public info HTTP: $($publicSummary.publicSafety.publicInfoHttpStatus)",
  "- Arobi private audit public HTTP: $($publicSummary.publicSafety.privateAuditPublicHttpStatus)",
  "- Public projection guard: $($publicSummary.publicSafety.publicProjectionGuard)",
  "",
  "## Benchmarks",
  "",
  "- Immaculate latest receipt present: $($publicSummary.benchmarks.immaculateLatestPresent)",
  "- BridgeBench receipt present: $($publicSummary.benchmarks.bridgeBenchPresent)",
  "- TerminalBench leaderboard: $($publicSummary.benchmarks.terminalBenchLeaderboardStatus)",
  "- Q benchmark corpus records: $($publicSummary.benchmarks.qBenchmarkCorpusRecords)",
  "",
  "## OpenJaws Runtime",
  "",
  "- Status: $($publicSummary.openJawsRuntime.status)",
  "- Summary: $($publicSummary.openJawsRuntime.summary)"
)

if (@($publicSummary.openJawsRuntime.warnings).Count -gt 0) {
  $markdownLines += ""
  $markdownLines += "Warnings:"
  foreach ($warning in @($publicSummary.openJawsRuntime.warnings)) {
    $detail = if ($warning.detail) { " - $($warning.detail)" } else { "" }
    $markdownLines += "- $($warning.id): $($warning.summary)$detail"
  }
}

if (@($publicSummary.findings).Count -gt 0) {
  $markdownLines += ""
  $markdownLines += "## Findings"
  $markdownLines += ""
  foreach ($finding in @($publicSummary.findings)) {
    $markdownLines += "- [$($finding.severity)] $($finding.id): $($finding.summary) Next: $($finding.nextAction)"
  }
}

$markdownLines += ""
$markdownLines += "## Boundary"
$markdownLines += ""
$markdownLines += $publicSummary.publicationBoundary
$markdownLines += ""
$markdownLines += 'Source JSON: `docs/wiki/Q-Operator-Readiness.json`'

($markdownLines -join "`n") | Set-Content -Path $OutputMarkdownPath -Encoding UTF8

Write-Output "Public-safe Q operator readiness surface written:"
Write-Output $OutputJsonPath
Write-Output $OutputMarkdownPath
