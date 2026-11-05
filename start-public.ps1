# Starts VideoDownloader and shares it with a public Cloudflare link.
# Close this window (or press Ctrl+C) to stop both.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$cf = Join-Path $root "bin\cloudflared.exe"

if (-not (Test-Path $cf)) {
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest -UseBasicParsing `
    -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
    -OutFile $cf
}

Write-Host "Starting VideoDownloader on http://localhost:3100 ..."
$server = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $root -NoNewWindow -PassThru

try {
  Start-Sleep -Seconds 2
  Write-Host ""
  Write-Host "Starting Cloudflare Tunnel. Look for the https://....trycloudflare.com link below."
  Write-Host "Anyone with that link can use your downloader while this window is open."
  Write-Host ""
  & $cf tunnel --no-autoupdate --url http://localhost:3100 2>&1 | ForEach-Object {
    $line = "$_"
    if ($line -match "https://[a-z0-9-]+\.trycloudflare\.com") {
      Write-Host ""
      Write-Host "  PUBLIC LINK: $($Matches[0])" -ForegroundColor Green
      Write-Host ""
    }
  }
}
finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  Write-Host "Stopped."
}
