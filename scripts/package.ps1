[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'path-safety.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($packageVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'artifacts'))
$source = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist\hermes-chinese-latex'))
Assert-NoReparsePath $source -Tree
Assert-NoReparsePath $artifactRoot -Tree
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
$zipName = "hermes-chinese-latex-$packageVersion.zip"
$zip = Join-Path $artifactRoot $zipName
Add-Type -AssemblyName System.IO.Compression.FileSystem
# Overwrite only the known release file; never recursively remove staging trees.
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
[IO.Compression.ZipFile]::CreateFromDirectory($source, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)
$hash = Get-Sha256 $zip
Set-Content -LiteralPath (Join-Path $artifactRoot "hermes-chinese-latex-$packageVersion.sha256") -Value "$hash  $zipName" -Encoding ASCII
Write-Output "Release ZIP: $zip"
Write-Output "SHA256: $hash"
$sourceZipName = "hermes-chinese-latex-$packageVersion-source.zip"
$sourceZip = Join-Path $artifactRoot $sourceZipName
if (Test-Path -LiteralPath $sourceZip) { Remove-Item -LiteralPath $sourceZip -Force }
Add-Type -AssemblyName System.IO.Compression
$archive = [IO.Compression.ZipFile]::Open($sourceZip, [IO.Compression.ZipArchiveMode]::Create)
try {
    $files = @()
    foreach ($folder in @('src', 'scripts', 'test', '.github')) {
        $folderPath = Join-Path $projectRoot $folder
        Assert-NoReparsePath $folderPath -Tree
        $files += Get-ChildItem -LiteralPath $folderPath -File -Recurse
    }
    foreach ($fileName in @('package.json', 'package-lock.json', 'README.md', 'LICENSE', 'VERIFICATION.md', 'THIRD_PARTY_NOTICES.txt', '.gitignore', '.gitattributes')) {
        $files += Get-Item -LiteralPath (Join-Path $projectRoot $fileName)
    }
    foreach ($file in $files) {
        $entryName = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }
$sourceHash = Get-Sha256 $sourceZip
Set-Content -LiteralPath (Join-Path $artifactRoot "hermes-chinese-latex-$packageVersion-source.sha256") -Value "$sourceHash  $sourceZipName" -Encoding ASCII
Write-Output "Source ZIP: $sourceZip"
Write-Output "Source SHA256: $sourceHash"
