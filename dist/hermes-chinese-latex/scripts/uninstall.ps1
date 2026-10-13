[CmdletBinding()]
param([string]$HermesHome)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'path-safety.ps1')
if (-not $HermesHome) {
    if ($env:HERMES_HOME) { $HermesHome = $env:HERMES_HOME }
    elseif ($env:LOCALAPPDATA -and (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'hermes\desktop-plugins'))) { $HermesHome = Join-Path $env:LOCALAPPDATA 'hermes' }
    else { $HermesHome = Join-Path $env:USERPROFILE '.hermes' }
}
$pluginsRoot = [IO.Path]::GetFullPath((Join-Path $HermesHome 'desktop-plugins'))
$destination = [IO.Path]::GetFullPath((Join-Path $pluginsRoot 'hermes-chinese-latex'))
if ([IO.Path]::GetDirectoryName($destination) -ne $pluginsRoot -or [IO.Path]::GetFileName($destination) -ne 'hermes-chinese-latex') { throw 'Unexpected uninstall target.' }
Assert-NoReparsePath $destination -Tree
if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Recurse -Force
    Write-Output "Uninstalled: $destination"
} else { Write-Output 'Plugin is not installed.' }
Write-Output 'Only this plugin is removed. Chat data and backups are preserved.'
