$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "launcher\BotControlCenterLauncher.cs"
$scheduledReleaseSourcePath = Join-Path $projectRoot "launcher\ScheduledReleaseProgress.cs"
$assetsDirectory = Join-Path $projectRoot "assets"
$iconPath = Join-Path $assetsDirectory "bot-control-center.ico"
$publicDirectory = Join-Path $projectRoot "public"
$webIconPath = Join-Path $publicDirectory "favicon.ico"
$binDirectory = Join-Path $projectRoot "bin"
$outputPath = Join-Path $binDirectory "BotControlCenter.exe"
$scheduledReleaseOutputPath = Join-Path $binDirectory "BotControlCenterScheduledRelease.exe"

New-Item -ItemType Directory -Path $assetsDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $publicDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $binDirectory -Force | Out-Null

Add-Type -AssemblyName System.Drawing

$bitmap = New-Object System.Drawing.Bitmap 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$backgroundPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$backgroundPath.AddArc(8, 8, 52, 52, 180, 90)
$backgroundPath.AddArc(196, 8, 52, 52, 270, 90)
$backgroundPath.AddArc(196, 196, 52, 52, 0, 90)
$backgroundPath.AddArc(8, 196, 52, 52, 90, 90)
$backgroundPath.CloseFigure()

$backgroundBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 7, 13, 19))
$graphics.FillPath($backgroundBrush, $backgroundPath)

$cyanPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 44, 209, 231)), 5
$limePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 199, 255, 0)), 8
$mutedPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 102, 116, 128)), 2
$graphics.DrawEllipse($mutedPen, 43, 43, 170, 170)
$graphics.DrawArc($cyanPen, 55, 55, 146, 146, 196, 132)
$graphics.DrawArc($limePen, 55, 55, 146, 146, 16, 132)

$cellOutline = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 245, 247, 250)), 4
$centerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 199, 255, 0))
$cellSize = 29
$gap = 10
$gridStart = 79
for ($row = 0; $row -lt 3; $row += 1) {
  for ($column = 0; $column -lt 3; $column += 1) {
    $x = $gridStart + ($column * ($cellSize + $gap))
    $y = $gridStart + ($row * ($cellSize + $gap))
    if ($row -eq 1 -and $column -eq 1) {
      $graphics.FillRectangle($centerBrush, $x, $y, $cellSize, $cellSize)
    } else {
      $graphics.DrawRectangle($cellOutline, $x, $y, $cellSize, $cellSize)
    }
  }
}

$pngStream = New-Object System.IO.MemoryStream
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()

$iconStream = [System.IO.File]::Create($iconPath)
$iconWriter = New-Object System.IO.BinaryWriter $iconStream
$iconWriter.Write([uint16] 0)
$iconWriter.Write([uint16] 1)
$iconWriter.Write([uint16] 1)
$iconWriter.Write([byte] 0)
$iconWriter.Write([byte] 0)
$iconWriter.Write([byte] 0)
$iconWriter.Write([byte] 0)
$iconWriter.Write([uint16] 1)
$iconWriter.Write([uint16] 32)
$iconWriter.Write([uint32] $pngBytes.Length)
$iconWriter.Write([uint32] 22)
$iconWriter.Write($pngBytes)
$iconWriter.Dispose()
Copy-Item -LiteralPath $iconPath -Destination $webIconPath -Force

$pngStream.Dispose()
$cellOutline.Dispose()
$centerBrush.Dispose()
$mutedPen.Dispose()
$limePen.Dispose()
$cyanPen.Dispose()
$backgroundBrush.Dispose()
$backgroundPath.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

$compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $compiler)) {
  $compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path -LiteralPath $compiler)) {
  throw "No se encontró el compilador de .NET Framework."
}

if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}
if (Test-Path -LiteralPath $scheduledReleaseOutputPath) {
  Remove-Item -LiteralPath $scheduledReleaseOutputPath -Force
}

& $compiler `
  /nologo `
  /target:winexe `
  "/win32icon:$iconPath" `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Drawing.dll `
  /reference:System.Windows.Forms.dll `
  "/out:$outputPath" `
  $sourcePath

if ($LASTEXITCODE -ne 0) {
  throw "La compilación del launcher falló con código $LASTEXITCODE."
}

& $compiler `
  /nologo `
  /target:winexe `
  "/win32icon:$iconPath" `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Drawing.dll `
  /reference:System.Windows.Forms.dll `
  "/out:$scheduledReleaseOutputPath" `
  $scheduledReleaseSourcePath

if ($LASTEXITCODE -ne 0) {
  throw "La compilación de la ventana de release falló con código $LASTEXITCODE."
}

Write-Output $outputPath
