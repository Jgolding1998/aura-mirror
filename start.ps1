$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules')) { npm.cmd ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
if (-not (Test-Path -LiteralPath 'public/models/pose_landmarker_lite.task')) { node scripts/prepare-models.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Open http://localhost:8787 once the API is ready. Press Ctrl+C to stop.'
npm.cmd start
