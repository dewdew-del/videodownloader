# Downloads yt-dlp.exe, ffmpeg.exe and ffprobe.exe into .\vendor (official sources only).
# Skips anything already there. Run before `npm start` or `npm run dist`.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$vendor = Join-Path $root "vendor"
New-Item -ItemType Directory -Force $vendor | Out-Null

$ytdlp = Join-Path $vendor "yt-dlp.exe"
if (-not (Test-Path $ytdlp)) {
  Write-Host "Downloading yt-dlp..."
  Invoke-WebRequest -UseBasicParsing `
    -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" `
    -OutFile $ytdlp
} else { Write-Host "yt-dlp.exe already there" }

$ffmpeg = Join-Path $vendor "ffmpeg.exe"
$ffprobe = Join-Path $vendor "ffprobe.exe"  # needed for MP3 conversion
if (-not ((Test-Path $ffmpeg) -and (Test-Path $ffprobe))) {
  Write-Host "Downloading FFmpeg (yt-dlp build)..."
  $zip = Join-Path $env:TEMP "kuha-ffmpeg.zip"
  $ex = Join-Path $env:TEMP "kuha-ffmpeg"
  Invoke-WebRequest -UseBasicParsing `
    -Uri "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" `
    -OutFile $zip
  if (Test-Path $ex) { Remove-Item -Recurse -Force $ex }
  Expand-Archive $zip $ex
  Copy-Item (Get-ChildItem $ex -Recurse -Filter ffmpeg.exe | Select-Object -First 1).FullName $ffmpeg
  Copy-Item (Get-ChildItem $ex -Recurse -Filter ffprobe.exe | Select-Object -First 1).FullName $ffprobe
  Remove-Item -Recurse -Force $ex, $zip
} else { Write-Host "ffmpeg.exe and ffprobe.exe already there" }

Write-Host "Tools ready in $vendor"
