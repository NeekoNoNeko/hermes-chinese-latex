[CmdletBinding()]
param([string]$HermesHome)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'path-safety.ps1')
$pluginId = 'hermes-chinese-latex'
if (-not $HermesHome) {
    if ($env:HERMES_HOME) { $HermesHome = $env:HERMES_HOME }
    elseif ($env:LOCALAPPDATA -and (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'hermes\desktop-plugins'))) { $HermesHome = Join-Path $env:LOCALAPPDATA 'hermes' }
    else { $HermesHome = Join-Path $env:USERPROFILE '.hermes' }
}
$resolvedHome = [IO.Path]::GetFullPath($HermesHome)
$pluginsRoot = [IO.Path]::GetFullPath((Join-Path $resolvedHome 'desktop-plugins'))
$destination = [IO.Path]::GetFullPath((Join-Path $pluginsRoot $pluginId))
if ([IO.Path]::GetDirectoryName($destination) -ne $pluginsRoot) { throw 'Unexpected plugin destination.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'dist\hermes-chinese-latex'
if (-not (Test-Path -LiteralPath $source)) { $source = $projectRoot }
Assert-NoReparsePath $source -Tree
Assert-NoReparsePath $destination -Tree
$expectedHash = ((Get-Content -LiteralPath (Join-Path $source 'SHA256.txt') -Raw).Trim() -split '\s+')[0]
$actualHash = Get-Sha256 (Join-Path $source 'plugin.js')
if ($actualHash -ne $expectedHash.ToLowerInvariant()) { throw 'Plugin SHA256 verification failed.' }
$backup = $null
if (Test-Path -LiteralPath $destination) {
    $backupRoot = Join-Path $resolvedHome 'desktop-plugin-backups'
    Assert-NoReparsePath $backupRoot
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    $backup = Join-Path $backupRoot ("$pluginId-" + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffffff'))
    Assert-NoReparsePath $backup -Tree
    Copy-Item -LiteralPath $destination -Destination $backup -Recurse
    foreach ($file in (Get-ChildItem -LiteralPath $destination -File -Recurse)) {
        $copy = Join-Path $backup $file.FullName.Substring($destination.Length + 1)
        if ((Get-Sha256 $file.FullName) -ne (Get-Sha256 $copy)) { throw 'Backup verification failed.' }
    }
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach ($fileName in @('SHA256.txt', 'build-info.json', 'THIRD_PARTY_NOTICES.txt', 'LICENSE', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $source $fileName) -Destination (Join-Path $destination $fileName) -Force
}
if (Test-Path -LiteralPath (Join-Path $source 'VERIFICATION.md')) {
    Copy-Item -LiteralPath (Join-Path $source 'VERIFICATION.md') -Destination (Join-Path $destination 'VERIFICATION.md') -Force
}
# The watched JavaScript file is the final reload trigger.
Copy-Item -LiteralPath (Join-Path $source 'plugin.js') -Destination (Join-Path $destination 'plugin.js') -Force
if ((Get-Sha256 (Join-Path $destination 'plugin.js')) -ne $actualHash) { throw 'Installed checksum differs.' }
Write-Output "Installed: $destination"
Write-Output "SHA256: $actualHash"
if ($backup) { Write-Output "Verified previous installation backup: $backup" }
Write-Output 'Hermes watches this directory. Reload desktop plugins if needed.'
