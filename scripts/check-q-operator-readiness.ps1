param(
  [string]$ArobiPrivateAuditUrl = "https://arobi.aura-genesis.org/api/v1/audit/private/api/v1/audit/entries",
  [string]$ArobiInfoUrl = "https://arobi.aura-genesis.org/api/v1/info",
  [string]$AsgardRoot = "",
  [string]$OpenJawsRoot = "",
  [string]$PushHarborRoot = "",
  [string]$OutputRoot = ".runtime\q-operator-readiness"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AsgardRoot)) {
  $AsgardRoot = Join-Path $env:USERPROFILE "Desktop\cheeks\Asgard"
}
if ([string]::IsNullOrWhiteSpace($OpenJawsRoot)) {
  $driveOpenJawsRoot = "D:\openjaws\OpenJaws"
  $desktopOpenJawsRoot = Join-Path $env:USERPROFILE "Desktop\openjaws\OpenJaws"
  $OpenJawsRoot = if (Test-Path $driveOpenJawsRoot) { $driveOpenJawsRoot } else { $desktopOpenJawsRoot }
}
if ([string]::IsNullOrWhiteSpace($PushHarborRoot)) {
  $PushHarborRoot = Join-Path (Resolve-Path ".").Path "Immaculate-push-harbor"
}

function Test-CommandAvailable {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-HttpProbe {
  param([string]$Url)
  if (-not (Test-CommandAvailable "curl.exe")) {
    return @{
      url = $Url
      status = "skipped"
      reason = "curl.exe unavailable"
    }
  }

  $raw = & curl.exe --max-time 20 --retry 2 --retry-all-errors -s -o NUL -w "%{http_code} %{size_download} %{time_total}" $Url
  $parts = ($raw -split "\s+").Where({ $_ -ne "" })
  return @{
    url = $Url
    status = "checked"
    httpCode = if ($parts.Count -ge 1) { [int]$parts[0] } else { 0 }
    bytes = if ($parts.Count -ge 2) { [int]$parts[1] } else { 0 }
    seconds = if ($parts.Count -ge 3) { [double]$parts[2] } else { 0.0 }
  }
}

function Invoke-ProjectionGuard {
  param([string]$ScriptPath)
  if (-not (Test-Path $ScriptPath)) {
    return @{
      status = "missing"
      scriptPath = $ScriptPath
    }
  }

  $stdoutPath = Join-Path $env:TEMP "q-operator-readiness-public-projection.out.txt"
  $stderrPath = Join-Path $env:TEMP "q-operator-readiness-public-projection.err.txt"
  $process = Start-Process -FilePath "powershell" -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $ScriptPath
    ) -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $stdout = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { "" }
  $stderr = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { "" }
  return @{
    status = if ($process.ExitCode -eq 0) { "passed" } else { "failed" }
    exitCode = $process.ExitCode
    scriptPath = $ScriptPath
    output = ($stdout + $stderr).Trim()
  }
}

function Read-JsonFileIfPresent {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $null
  }
  try {
    return Get-Content $Path -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Read-FirstJsonFileIfPresent {
  param([string[]]$Paths)
  foreach ($candidatePath in @($Paths)) {
    if ($candidatePath -and (Test-Path $candidatePath)) {
      return Read-JsonFileIfPresent $candidatePath
    }
  }
  return $null
}

function Resolve-AsgardRoot {
  param([string]$ConfiguredRoot)
  $candidates = @(
    $ConfiguredRoot,
    "D:\cheeks\Asgard",
    (Join-Path $env:USERPROFILE "Desktop\cheeks\Asgard")
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Select-Object -Unique

  foreach ($candidate in $candidates) {
    $guardPath = Join-Path $candidate "ignite\arobi-network\scripts\check-public-projection.ps1"
    if ((Test-Path $candidate) -and (Test-Path $guardPath)) {
      return (Resolve-Path $candidate).Path
    }
  }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  return $ConfiguredRoot
}

function Resolve-OpenJawsRoot {
  param([string]$ConfiguredRoot)
  $candidates = @(
    $ConfiguredRoot,
    "D:\openjaws\OpenJaws",
    (Join-Path $env:USERPROFILE "Desktop\openjaws\OpenJaws")
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Select-Object -Unique

  foreach ($candidate in $candidates) {
    $runtimeCoherencePath = Join-Path $candidate "scripts\runtime-coherence.ts"
    if ((Test-Path $candidate) -and (Test-Path $runtimeCoherencePath)) {
      return (Resolve-Path $candidate).Path
    }
  }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  return $ConfiguredRoot
}

function Invoke-OpenJawsRuntimeCoherence {
  param([string]$Root)
  if (-not (Test-Path $Root)) {
    return @{
      status = "missing"
      root = $Root
      reason = "OpenJaws root not found"
    }
  }
  if (-not (Test-CommandAvailable "bun")) {
    return @{
      status = "skipped"
      root = $Root
      reason = "bun unavailable"
    }
  }

  $stdoutPath = Join-Path $env:TEMP "q-operator-readiness-openjaws-runtime.out.json"
  $stderrPath = Join-Path $env:TEMP "q-operator-readiness-openjaws-runtime.err.txt"
  $bunPath = (Get-Command "bun").Source
  $process = Start-Process -FilePath $bunPath -ArgumentList @(
      "scripts/runtime-coherence.ts",
      "--json"
    ) -WorkingDirectory $Root -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

  if (-not $process.WaitForExit(60000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    return @{
      status = "timeout"
      root = $Root
      seconds = 60
    }
  }

  $stdout = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { "" }
  $stderr = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { "" }
  try {
    $report = $stdout | ConvertFrom-Json
    return @{
      status = $report.status
      root = $Root
      exitCode = $process.ExitCode
      summary = $report.summary
      okCount = @($report.checks | Where-Object { $_.status -eq "ok" }).Count
      warningCount = @($report.checks | Where-Object { $_.status -eq "warning" }).Count
      failedCount = @($report.checks | Where-Object { $_.status -eq "failed" }).Count
      warnings = @($report.checks | Where-Object { $_.status -eq "warning" } | Select-Object id,summary,detail)
      failures = @($report.checks | Where-Object { $_.status -eq "failed" } | Select-Object id,summary,detail)
    }
  } catch {
    return @{
      status = "unparsable"
      root = $Root
      exitCode = $process.ExitCode
      output = ($stdout + $stderr).Trim()
    }
  }
}

function Get-GitHubRuns {
  if (-not (Test-CommandAvailable "gh")) {
    return @{
      status = "skipped"
      reason = "gh unavailable"
    }
  }

  $raw = & gh run list -R PossumXI/Immaculate --limit 30 --json databaseId,name,status,conclusion,headBranch,createdAt,updatedAt 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $raw) {
    return @{
      status = "unavailable"
      reason = "gh run list failed"
    }
  }
  return @{
    status = "checked"
    runs = $raw | ConvertFrom-Json
  }
}

function New-ReadinessFinding {
  param(
    [string]$Id,
    [string]$Severity,
    [string]$Area,
    [string]$Summary,
    [string]$NextAction,
    [bool]$BlocksPublicProduction = $false,
    [bool]$BlocksPrivateProduction = $false,
    [bool]$BlocksVoiceProduction = $false,
    [bool]$BlocksBenchmarkPublication = $false
  )
  return [ordered]@{
    id = $Id
    severity = $Severity
    area = $Area
    summary = $Summary
    nextAction = $NextAction
    blocksPublicProduction = $BlocksPublicProduction
    blocksPrivateProduction = $BlocksPrivateProduction
    blocksVoiceProduction = $BlocksVoiceProduction
    blocksBenchmarkPublication = $BlocksBenchmarkPublication
  }
}

function Get-ReadinessFindings {
  param([hashtable]$Receipt)
  $findings = New-Object System.Collections.Generic.List[object]

  $privateAuditCode = $Receipt.arobiPublicSafety.privateAuditProbe.httpCode
  if ($privateAuditCode -ge 200 -and $privateAuditCode -lt 300) {
    [void]$findings.Add((New-ReadinessFinding `
      -Id "arobi-private-audit-exposed" `
      -Severity "critical" `
      -Area "arobi-public-safety" `
      -Summary "Private audit route returned HTTP $privateAuditCode on the public edge." `
      -NextAction "Close the public private-audit route before publishing any public showcase." `
      -BlocksPublicProduction $true `
      -BlocksPrivateProduction $true))
  } elseif ($privateAuditCode -ne 403) {
    [void]$findings.Add((New-ReadinessFinding `
      -Id "arobi-private-audit-edge-degraded" `
      -Severity "warning" `
      -Area "arobi-public-safety" `
      -Summary "Private audit route is not leaking data, but expected HTTP 403 and got $privateAuditCode." `
      -NextAction "Restore the Arobi edge/origin route and rerun npm run operator:readiness."))
  }

  if ($Receipt.arobiPublicSafety.publicProjectionGuard.status -ne "passed") {
    [void]$findings.Add((New-ReadinessFinding `
      -Id "arobi-public-projection-guard-failed" `
      -Severity "critical" `
      -Area "arobi-public-safety" `
      -Summary "Public projection guard is $($Receipt.arobiPublicSafety.publicProjectionGuard.status)." `
      -NextAction "Remove raw chain data, key material, logs, secrets, and private routing material from the public projection tree." `
      -BlocksPublicProduction $true))
  }

  if (-not $Receipt.wandb.credentialPresent) {
    [void]$findings.Add((New-ReadinessFinding `
      -Id "wandb-credential-missing" `
      -Severity "warning" `
      -Area "benchmarks" `
      -Summary "W&B export cannot publish because WANDB_API_KEY or IMMACULATE_WANDB_API_KEY is missing." `
      -NextAction "Set WANDB_API_KEY or IMMACULATE_WANDB_API_KEY, then run npm run benchmark:export:wandb." `
      -BlocksBenchmarkPublication $true))
  }

  $terminalBenchStatus = $Receipt.benchmarkReceipts.terminalBenchLeaderboardStatus
  if ($terminalBenchStatus -ne "ready" -and $terminalBenchStatus -ne "submitted") {
    $terminalBenchStatusLabel = if ($terminalBenchStatus) { $terminalBenchStatus } else { "unavailable" }
    [void]$findings.Add((New-ReadinessFinding `
      -Id "terminalbench-full-sweep-pending" `
      -Severity "warning" `
      -Area "benchmarks" `
      -Summary "TerminalBench leaderboard status is $terminalBenchStatusLabel." `
      -NextAction "Run the full official TerminalBench sweep before claiming leaderboard results." `
      -BlocksBenchmarkPublication $true))
  }

  $githubRuns = @($Receipt.github.runs)
  $latestBenchmarkCredibility = $githubRuns |
    Where-Object { $_.name -eq "Benchmark Credibility" } |
    Sort-Object -Property createdAt -Descending |
    Select-Object -First 1
  if ($latestBenchmarkCredibility -and $latestBenchmarkCredibility.conclusion -ne "success") {
    [void]$findings.Add((New-ReadinessFinding `
      -Id "benchmark-credibility-not-green" `
      -Severity "warning" `
      -Area "github-actions" `
      -Summary "Latest Benchmark Credibility run is $($latestBenchmarkCredibility.conclusion) from $($latestBenchmarkCredibility.createdAt)." `
      -NextAction "Push the local workflow hardening or rerun Benchmark Credibility after the workflow update is on the target branch." `
      -BlocksBenchmarkPublication $true))
  }

  if ($Receipt.openJawsRuntime.status -eq "failed") {
    [void]$findings.Add((New-ReadinessFinding `
      -Id "openjaws-runtime-failed" `
      -Severity "critical" `
      -Area "openjaws-runtime" `
      -Summary $Receipt.openJawsRuntime.summary `
      -NextAction "Fix OpenJaws runtime failures in the receipt before treating Discord/OpenJaws as production ready." `
      -BlocksPrivateProduction $true))
  } elseif ($Receipt.openJawsRuntime.status -eq "warning") {
    foreach ($warning in @($Receipt.openJawsRuntime.warnings)) {
      $warningId = if ($warning.id) { $warning.id } else { "openjaws-runtime-warning" }
      $nextAction = "Inspect OpenJaws runtime coherence and rerun npm run operator:readiness."
      if ($warningId -eq "probe-Viola") {
        $nextAction = "Rotate or update Viola's DISCORD_BOT_TOKEN, then restart the Viola agent."
      } elseif ($warningId -eq "harness-receipt-alignment") {
        $nextAction = "Wait for or trigger the next Q patrol refresh; live harness is already reachable."
      }
      [void]$findings.Add((New-ReadinessFinding `
        -Id "openjaws-$warningId" `
        -Severity "warning" `
        -Area "openjaws-runtime" `
        -Summary "$($warning.summary) $($warning.detail)".Trim() `
        -NextAction $nextAction `
        -BlocksVoiceProduction ($warningId -eq "probe-Viola")))
    }
  }

  return $findings.ToArray()
}

function Get-ProductionGates {
  param([object[]]$Findings)
  $findingsArray = @($Findings)
  return [ordered]@{
    publicSafetyReady = -not [bool]($findingsArray | Where-Object { $_.blocksPublicProduction })
    privateRuntimeReady = -not [bool]($findingsArray | Where-Object { $_.blocksPrivateProduction })
    voiceReady = -not [bool]($findingsArray | Where-Object { $_.blocksVoiceProduction })
    benchmarkPublicationReady = -not [bool]($findingsArray | Where-Object { $_.blocksBenchmarkPublication })
    criticalCount = @($findingsArray | Where-Object { $_.severity -eq "critical" }).Count
    warningCount = @($findingsArray | Where-Object { $_.severity -eq "warning" }).Count
  }
}

$root = (Resolve-Path ".").Path
$resolvedAsgardRoot = Resolve-AsgardRoot $AsgardRoot
$resolvedOpenJawsRoot = Resolve-OpenJawsRoot $OpenJawsRoot
$outputPath = Join-Path $root $OutputRoot
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$contextPath = Join-Path $root "apps\harness\src\q-operating-context.ts"
$governancePath = Join-Path $root "apps\harness\src\governance.ts"
$benchmarkLatestPath = Join-Path $root "benchmarks\latest.json"
$benchmarkStatusPath = Join-Path $root "docs\wiki\Benchmark-Status.json"
$bridgeBenchPath = Join-Path $PushHarborRoot "docs\wiki\BridgeBench.json"
$bridgeBenchRepoPath = Join-Path $root "docs\wiki\BridgeBench.json"
$terminalBenchReceiptPath = Join-Path $PushHarborRoot "docs\wiki\Terminal-Bench-Receipt.json"
$terminalBenchReceiptRepoPath = Join-Path $root "docs\wiki\Terminal-Bench-Receipt.json"
$qCorpusReceiptPath = Join-Path $PushHarborRoot "docs\wiki\Q-Benchmark-Corpus.json"
$qCorpusReceiptRepoPath = Join-Path $root "docs\wiki\Q-Benchmark-Corpus.json"
$projectionGuardPath = Join-Path $resolvedAsgardRoot "ignite\arobi-network\scripts\check-public-projection.ps1"

$benchmarkLatest = Read-FirstJsonFileIfPresent @($benchmarkLatestPath, $benchmarkStatusPath)
$bridgeBench = Read-FirstJsonFileIfPresent @($bridgeBenchPath, $bridgeBenchRepoPath)
$terminalBenchReceipt = Read-FirstJsonFileIfPresent @($terminalBenchReceiptPath, $terminalBenchReceiptRepoPath)
$qCorpusReceipt = Read-FirstJsonFileIfPresent @($qCorpusReceiptPath, $qCorpusReceiptRepoPath)

$receipt = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  currentUtcDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
  currentDate = (Get-Date).ToString("yyyy-MM-dd")
  timezone = [System.TimeZoneInfo]::Local.Id
  paths = @{
    asgardRoot = $resolvedAsgardRoot
    openJawsRoot = $resolvedOpenJawsRoot
    pushHarborRoot = $PushHarborRoot
  }
  qFreshness = @{
    operatingContextSourcePresent = Test-Path $contextPath
    governancePolicySourcePresent = Test-Path $governancePath
    expectedKnowledgeHorizon = "2024-06"
    rule = "Q must treat post-horizon and time-sensitive facts as stale until verified by live tools or approved retrieval."
  }
  arobiPublicSafety = @{
    privateAuditProbe = Invoke-HttpProbe $ArobiPrivateAuditUrl
    publicInfoProbe = Invoke-HttpProbe $ArobiInfoUrl
    publicProjectionGuard = Invoke-ProjectionGuard $projectionGuardPath
  }
  benchmarkReceipts = @{
    immaculateLatestPresent = [bool]$benchmarkLatest
    immaculateLatestSuite = if ($benchmarkLatest) { $benchmarkLatest.suiteId } else { $null }
    immaculateFailedAssertions = if ($benchmarkLatest) { $benchmarkLatest.failedAssertions } else { $null }
    bridgeBenchPresent = [bool]$bridgeBench
    bridgeBenchGeneratedAt = if ($bridgeBench) { $bridgeBench.generatedAt } else { $null }
    terminalBenchReceiptPresent = [bool]$terminalBenchReceipt
    terminalBenchLeaderboardStatus = if ($terminalBenchReceipt) { $terminalBenchReceipt.leaderboard.status } else { $null }
    qBenchmarkCorpusPresent = [bool]$qCorpusReceipt
    qBenchmarkCorpusRecords = if ($qCorpusReceipt) { $qCorpusReceipt.recordCount } else { $null }
  }
  wandb = @{
    credentialPresent = [bool]($env:WANDB_API_KEY -or $env:IMMACULATE_WANDB_API_KEY)
    exportCommand = "npm run benchmark:export:wandb"
  }
  openJawsRuntime = Invoke-OpenJawsRuntimeCoherence $resolvedOpenJawsRoot
  github = Get-GitHubRuns
}
$receipt.findings = Get-ReadinessFindings $receipt
$receipt.productionGates = Get-ProductionGates $receipt.findings

$jsonPath = Join-Path $outputPath "latest.json"
$mdPath = Join-Path $outputPath "latest.md"
$receipt | ConvertTo-Json -Depth 12 | Set-Content -Path $jsonPath -Encoding UTF8

$privateAuditCode = $receipt.arobiPublicSafety.privateAuditProbe.httpCode
$projectionStatus = $receipt.arobiPublicSafety.publicProjectionGuard.status
$openJawsRuntimeStatus = $receipt.openJawsRuntime.status
$githubStatus = $receipt.github.status
$markdownLines = @(
  "# Q Operator Readiness Receipt",
  "",
  "- Generated: $($receipt.generatedAt)",
  "- Current UTC date: $($receipt.currentUtcDate)",
  "- Current date: $($receipt.currentDate)",
  "- Timezone: $($receipt.timezone)",
  "- Q operating context source present: $($receipt.qFreshness.operatingContextSourcePresent)",
  "- Private audit public HTTP status: $privateAuditCode",
  "- Public projection guard: $projectionStatus",
  "- Immaculate benchmark latest present: $($receipt.benchmarkReceipts.immaculateLatestPresent)",
  "- BridgeBench receipt present: $($receipt.benchmarkReceipts.bridgeBenchPresent)",
  "- TerminalBench leaderboard status: $($receipt.benchmarkReceipts.terminalBenchLeaderboardStatus)",
  "- Q benchmark corpus records: $($receipt.benchmarkReceipts.qBenchmarkCorpusRecords)",
  "- W&B credential present: $($receipt.wandb.credentialPresent)",
  "- OpenJaws runtime coherence: $openJawsRuntimeStatus",
  "- Readiness findings: $(@($receipt.findings).Count)",
  "- Public safety ready: $($receipt.productionGates.publicSafetyReady)",
  "- Private runtime ready: $($receipt.productionGates.privateRuntimeReady)",
  "- Voice ready: $($receipt.productionGates.voiceReady)",
  "- Benchmark publication ready: $($receipt.productionGates.benchmarkPublicationReady)",
  "- GitHub run probe: $githubStatus",
  "",
  "## Rule",
  "",
  $receipt.qFreshness.rule,
  ""
)

if ($receipt.openJawsRuntime.summary) {
  $markdownLines += "## OpenJaws Runtime"
  $markdownLines += ""
  $markdownLines += $receipt.openJawsRuntime.summary
  $openJawsWarnings = @($receipt.openJawsRuntime.warnings)
  if ($openJawsWarnings.Count -gt 0) {
    $markdownLines += ""
    $markdownLines += "Warnings:"
    foreach ($warning in $openJawsWarnings) {
      $detail = if ($warning.detail) { " - $($warning.detail)" } else { "" }
      $markdownLines += "- $($warning.id): $($warning.summary)$detail"
    }
  }
  $openJawsFailures = @($receipt.openJawsRuntime.failures)
  if ($openJawsFailures.Count -gt 0) {
    $markdownLines += ""
    $markdownLines += "Failures:"
    foreach ($failure in $openJawsFailures) {
      $detail = if ($failure.detail) { " - $($failure.detail)" } else { "" }
      $markdownLines += "- $($failure.id): $($failure.summary)$detail"
    }
  }
  $markdownLines += ""
}

$findings = @($receipt.findings)
if ($findings.Count -gt 0) {
  $markdownLines += "## Findings"
  $markdownLines += ""
  foreach ($finding in $findings) {
    $markdownLines += "- [$($finding.severity)] $($finding.id): $($finding.summary) Next: $($finding.nextAction)"
  }
  $markdownLines += ""
}

$markdownLines += "## Files"
$markdownLines += ""
$markdownLines += "- JSON: ``$jsonPath``"
$markdownLines += "- Markdown: ``$mdPath``"
$markdown = $markdownLines -join "`n"
$markdown | Set-Content -Path $mdPath -Encoding UTF8

Write-Output "Q operator readiness receipt written:"
Write-Output $jsonPath
Write-Output $mdPath

if ($privateAuditCode -ge 200 -and $privateAuditCode -lt 300) {
  Write-Error "Private audit public route returned $privateAuditCode. This is treated as a data exposure risk."
  exit 1
}

if ($privateAuditCode -ne 403) {
  Write-Warning "Private audit public route is not leaking data, but expected 403 and got $privateAuditCode. Treat the edge/origin route as degraded until fixed."
}

if ($projectionStatus -ne "passed") {
  Write-Warning "Public projection guard is not passing. Inspect $jsonPath before publishing."
}

if ($openJawsRuntimeStatus -eq "warning" -or $openJawsRuntimeStatus -eq "failed" -or $openJawsRuntimeStatus -eq "timeout" -or $openJawsRuntimeStatus -eq "unparsable") {
  Write-Warning "OpenJaws runtime coherence is $openJawsRuntimeStatus. Inspect $jsonPath before treating Discord/OpenJaws as production ready."
}
