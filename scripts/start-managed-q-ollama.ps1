param(
  [string]$HostAddress = "127.0.0.1:11435",
  [string]$RuntimeDir = ".runtime\\ollama-managed",
  [string]$ContextLength = "4096",
  [string]$NumParallel = "1",
  [string]$FlashAttention = "0"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedRuntimeDir = Join-Path $repoRoot $RuntimeDir
New-Item -ItemType Directory -Force -Path $resolvedRuntimeDir | Out-Null

$stdoutPath = Join-Path $resolvedRuntimeDir "ollama-managed.log"
$stderrPath = Join-Path $resolvedRuntimeDir "ollama-managed.err.log"
Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

$env:OLLAMA_HOST = $HostAddress
$env:OLLAMA_FLASH_ATTENTION = $FlashAttention
$env:OLLAMA_CONTEXT_LENGTH = $ContextLength
$env:OLLAMA_NUM_PARALLEL = $NumParallel

$process = Start-Process `
  -FilePath "ollama" `
  -ArgumentList @("serve") `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

[pscustomobject]@{
  pid = $process.Id
  host = $HostAddress
  runtimeDir = $resolvedRuntimeDir
  stdout = $stdoutPath
  stderr = $stderrPath
} | ConvertTo-Json -Depth 4
