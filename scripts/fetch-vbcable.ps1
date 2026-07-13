# Downloads and extracts the official VB-CABLE driver pack into
# src-tauri/resources/vbcable/pack/ so the NSIS installer can bundle it.
#
# VB-CABLE is VB-Audio donationware: https://vb-audio.com/Cable/
# Redistribution requires end-user attribution (see UI + README).

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$DestRoot = Join-Path $Root "src-tauri\resources\vbcable"
$PackDir = Join-Path $DestRoot "pack"
$ZipPath = Join-Path $DestRoot "VBCABLE_Driver_Pack.zip"
$Url = "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip"

New-Item -ItemType Directory -Force -Path $DestRoot | Out-Null

$SetupX64 = Join-Path $PackDir "VBCABLE_Setup_x64.exe"
if (Test-Path $SetupX64) {
  Write-Host "VB-CABLE pack already present at $PackDir"
  exit 0
}

Write-Host "Downloading VB-CABLE from $Url ..."
$ProgressPreference = "SilentlyContinue"
Invoke-WebRequest -Uri $Url -OutFile $ZipPath

if (Test-Path $PackDir) {
  Remove-Item -Recurse -Force $PackDir
}
New-Item -ItemType Directory -Force -Path $PackDir | Out-Null

Write-Host "Extracting to $PackDir ..."
Expand-Archive -LiteralPath $ZipPath -DestinationPath $PackDir -Force

# Some zips nest a single top-level folder — flatten one level if needed.
$nested = Get-ChildItem $PackDir -Directory
$files = Get-ChildItem $PackDir -File
if ($files.Count -eq 0 -and $nested.Count -eq 1) {
  Get-ChildItem $nested[0].FullName | Move-Item -Destination $PackDir -Force
  Remove-Item $nested[0].FullName -Recurse -Force
}

if (-not (Test-Path $SetupX64) -and -not (Test-Path (Join-Path $PackDir "VBCABLE_Setup.exe"))) {
  throw "VBCABLE_Setup_x64.exe not found after extract. Pack layout may have changed."
}

# Keep the zip out of the bundle; pack/ is what gets shipped.
Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue

Write-Host "VB-CABLE pack ready."
Get-ChildItem $PackDir | Select-Object Name, Length | Format-Table -AutoSize
