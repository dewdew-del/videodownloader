# Downloads yt-dlp.exe and ffmpeg.exe into .\bin (official sources).
$ErrorActionPreference = "Stop"
$bin = Join-Path $PSScriptRoot "bin"
New-Item -ItemType Directory -Force $bin | Out-Null

Write-Host "Downloading yt-dlp..."
Invoke-WebRequest -UseBasicParsing `
  -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" `
  -OutFile (Join-Path $bin "yt-dlp.exe")

Write-Host "Downloading FFmpeg (yt-dlp build)..."
$zip = Join-Path $env:TEMP "ffmpeg-vd.zip"
Invoke-WebRequest -UseBasicParsing `
  -Uri "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" `
  -OutFile $zip
$ex = Join-Path $env:TEMP "ffmpeg-vd"
if (Test-Path $ex) { Remove-Item -Recurse -Force $ex }
Expand-Archive $zip $ex
Copy-Item (Get-ChildItem $ex -Recurse -Filter ffmpeg.exe | Select-Object -First 1).FullName $bin
Copy-Item (Get-ChildItem $ex -Recurse -Filter ffprobe.exe | Select-Object -First 1).FullName $bin
Remove-Item -Recurse -Force $ex, $zip

Write-Host "Done. Now run: npm start"
