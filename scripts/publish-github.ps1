param(
  [string]$Owner = "PossumXI",
  [string]$Repo = "Immaculate",
  [string]$Description = "Immaculate: a governed orchestration substrate for durable multi-plane intelligence, neurodata ingest, and supervised actuation.",
  [string]$Homepage = "https://PossumX.dev"
)

$ErrorActionPreference = "Stop"
$ghPath = "C:\Program Files\GitHub CLI"
if (Test-Path $ghPath) {
  $env:Path += ";$ghPath"
}

function Invoke-Gh {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args,
    [switch]$AllowFailure
  )

  & gh @Args
  if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
    throw "gh command failed: gh $($Args -join ' ')"
  }
}

function Test-GhAuth {
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = "gh"
  $startInfo.Arguments = "auth status"
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $null = $process.StandardOutput.ReadToEnd()
  $null = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  return $process.ExitCode -eq 0
}

function Start-GhAuthWindow {
  $command = "$env:Path += ';$ghPath'; gh auth login --hostname github.com --git-protocol https --web --clipboard"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $command | Out-Null
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is not installed. Install it first with winget install --id GitHub.cli --exact --source winget"
}

if (-not (Test-Path ".git")) {
  throw "Run this script from the git repository root."
}

if (-not (Test-GhAuth)) {
  Start-GhAuthWindow
  throw "GitHub CLI is not authenticated. A browser login window was opened. Complete the GitHub login for PossumXI, then rerun this script."
}

$repoRef = "$Owner/$Repo"
$originUrl = "https://github.com/$repoRef.git"

& gh repo view $repoRef *> $null
$repoExists = $LASTEXITCODE -eq 0

if (-not $repoExists) {
  Invoke-Gh -Args @(
    "repo", "create", $repoRef,
    "--public",
    "--source", ".",
    "--remote", "origin",
    "--push",
    "--description", $Description,
    "--homepage", $Homepage
  )
} else {
  $hasOrigin = $false
  & git remote get-url origin *> $null
  if ($LASTEXITCODE -eq 0) {
    $hasOrigin = $true
  }
  if ($hasOrigin) {
    & git remote set-url origin $originUrl
  } else {
    & git remote add origin $originUrl
  }
  & git push -u origin main
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed"
  }
}

Invoke-Gh -Args @(
  "repo", "edit", $repoRef,
  "--description", $Description,
  "--homepage", $Homepage,
  "--default-branch", "main",
  "--enable-issues",
  "--enable-wiki",
  "--enable-discussions",
  "--delete-branch-on-merge",
  "--enable-auto-merge",
  "--enable-squash-merge",
  "--enable-rebase-merge",
  "--enable-merge-commit=false",
  "--add-topic", "ai",
  "--add-topic", "orchestration",
  "--add-topic", "connectome",
  "--add-topic", "benchmarking",
  "--add-topic", "bci",
  "--add-topic", "typescript"
)

Invoke-Gh -Args @("repo", "edit", $repoRef, "--enable-secret-scanning") -AllowFailure
Invoke-Gh -Args @("repo", "edit", $repoRef, "--enable-secret-scanning-push-protection") -AllowFailure

$wikiSource = Join-Path (Get-Location) "docs/wiki"
if (Test-Path $wikiSource) {
  $tempRoot = Join-Path $env:TEMP ("immaculate-wiki-" + [guid]::NewGuid().ToString("N"))
  & git clone "https://github.com/$repoRef.wiki.git" $tempRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to clone wiki repository"
  }

  Get-ChildItem $wikiSource -Filter *.md | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $tempRoot $_.Name) -Force
  }

  $sidebarPath = Join-Path $tempRoot "_Sidebar.md"
  @(
    "# Immaculate Wiki",
    "",
    "- [[Home]]",
    "- [[Operator-Field-Guide]]"
  ) | Set-Content -Path $sidebarPath -Encoding utf8

  & git -C $tempRoot config user.name "$(git config user.name)"
  & git -C $tempRoot config user.email "$(git config user.email)"
  & git -C $tempRoot add .
  & git -C $tempRoot diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    & git -C $tempRoot commit -m "Seed wiki from docs/wiki"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to commit wiki content"
    }
    & git -C $tempRoot push
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to push wiki content"
    }
  }

  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}

Write-Host "Published $repoRef"
Write-Host "Remote: $originUrl"
