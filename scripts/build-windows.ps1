[CmdletBinding()]
param(
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') {
    throw 'This script must run on Windows with the MSVC C++ build tools and Windows SDK installed.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$originalPath = $env:PATH
Push-Location $projectRoot
try {
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\.bun\bin;$env:PATH"
    foreach ($command in @('bun', 'cargo', 'rustc')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Missing required command: $command"
        }
    }

    function Invoke-Checked {
        param([string]$Command, [string[]]$Arguments)
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Command $($Arguments -join ' ') failed (exit $LASTEXITCODE)."
        }
    }

    Invoke-Checked 'bun' @('install', '--frozen-lockfile')
    if (-not $SkipTests) {
        Invoke-Checked 'bun' @('run', 'test')
        Invoke-Checked 'cargo' @('test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml')
    }

    # Pin the target directory so Cargo environment overrides cannot hide outputs.
    $previousTargetDir = $env:CARGO_TARGET_DIR
    try {
        $env:CARGO_TARGET_DIR = Join-Path $projectRoot 'src-tauri/target'
        Invoke-Checked 'bun' @('run', 'tauri', 'build', '--bundles', 'nsis', '--', '--locked')
    } finally {
        $env:CARGO_TARGET_DIR = $previousTargetDir
    }

    $releaseDir = Join-Path $projectRoot 'src-tauri/target/release'
    $exe = Join-Path $releaseDir 'DedsiCodexMosaic.exe'
    $version = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    $installers = @(Get-ChildItem (Join-Path $releaseDir 'bundle/nsis') -Filter "DedsiCodexMosaic_${version}_*-setup.exe")
    if (-not (Test-Path -LiteralPath $exe) -or $installers.Count -eq 0) {
        throw 'Build completed without the expected application or NSIS installer.'
    }

    $outputDir = Join-Path $projectRoot 'artifacts/windows'
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    foreach ($installer in $installers) {
        Copy-Item -LiteralPath $installer.FullName -Destination $outputDir -Force
    }
    Write-Host "Windows artifacts: $outputDir"
    Get-ChildItem $outputDir -Filter '*-setup.exe' | ForEach-Object {
        # Use .NET directly: some Windows PowerShell environments do not expose Get-FileHash.
        $artifactPath = $_.FullName
        $artifactStream = [System.IO.File]::OpenRead($artifactPath)
        $artifactHasher = [System.Security.Cryptography.SHA256]::Create()
        try {
            [PSCustomObject]@{
                Algorithm = 'SHA256'
                Hash = [System.BitConverter]::ToString($artifactHasher.ComputeHash($artifactStream)).Replace('-', '')
                Path = $artifactPath
            }
        } finally {
            $artifactStream.Dispose()
            $artifactHasher.Dispose()
        }
    }
} finally {
    Pop-Location
    $env:PATH = $originalPath
}
