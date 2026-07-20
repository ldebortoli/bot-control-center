param(
  [string] $AppsDirectory
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildScript = Join-Path $PSScriptRoot "build-windows-launcher.ps1"
$launcherPath = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript | Select-Object -Last 1).Trim()

if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  throw "No se encontró el launcher compilado en $launcherPath."
}

if ([string]::IsNullOrWhiteSpace($AppsDirectory)) {
  $botControlCenterRoot = Split-Path -Parent $projectRoot
  $codexRoot = Split-Path -Parent $botControlCenterRoot
  $AppsDirectory = Join-Path $codexRoot "CODEX APPS"
}

New-Item -ItemType Directory -Path $AppsDirectory -Force | Out-Null

$shortcutPath = Join-Path $AppsDirectory "Bot Control Center.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$launcherPath,0"
$shortcut.Description = "Dashboard local para controlar y observar bots"
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Output $shortcutPath
