$workspaceRoot = Split-Path -Parent $PSScriptRoot
$cargoHome = Join-Path $workspaceRoot ".cargo"
$rustupHome = Join-Path $workspaceRoot ".rustup"
$cargoBin = Join-Path $cargoHome "bin"

$env:CARGO_HOME = $cargoHome
$env:RUSTUP_HOME = $rustupHome

if (-not ($env:PATH -split ";" | Where-Object { $_ -eq $cargoBin })) {
  $env:PATH = "$cargoBin;$env:PATH"
}

Write-Host "Immaculate local Rust environment loaded."
Write-Host "CARGO_HOME=$env:CARGO_HOME"
Write-Host "RUSTUP_HOME=$env:RUSTUP_HOME"
Write-Host "PATH begins with $cargoBin"
