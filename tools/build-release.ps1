$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'manifest.json') | ConvertFrom-Json
$outputDirectory = Join-Path $projectRoot 'dist'
$stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("originmatrix-release-" + [guid]::NewGuid())
$archive = Join-Path $outputDirectory ("originmatrix-" + $manifest.version + ".zip")

try {
  New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  foreach ($directory in @('filters', 'icons', 'rules', 'src')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $stagingDirectory -Recurse
  }
  foreach ($file in @('manifest.json', 'LICENSE.md', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stagingDirectory
  }
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
  Compress-Archive -Path (Join-Path $stagingDirectory '*') -DestinationPath $archive -CompressionLevel Optimal
  Write-Output $archive
} finally {
  if (Test-Path -LiteralPath $stagingDirectory) { Remove-Item -LiteralPath $stagingDirectory -Recurse -Force }
}
