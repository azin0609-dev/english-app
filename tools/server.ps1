# Small local web server for the investment dashboard (no install needed).
# Usage: powershell -ExecutionPolicy Bypass -File tools\server.ps1 [-Port 8001] [-NoBrowser]
param(
  [int]$Port = 8001,
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$NoBrowser
)

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.ico' = 'image/x-icon'
  '.md' = 'text/plain; charset=utf-8'
  '.txt' = 'text/plain; charset=utf-8'
}

$rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
$prefix = "http://localhost:$Port/"

function Open-Browser {
  if ($NoBrowser) { return }
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($chrome) { Start-Process $chrome $prefix } else { Start-Process $prefix }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Port $Port is already in use. The server is probably running already."
  Write-Host "Opening $prefix ..."
  Open-Browser
  exit 0
}

Write-Host "Invest dashboard is running at $prefix"
Write-Host "Folder: $rootFull"
Write-Host "Keep this window open while you use the app. Close it to stop the server."
Open-Browser

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) { }
    $ctx = $task.GetAwaiter().GetResult()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $rel = $path.TrimStart('/').Replace('/', '\')
      $file = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootFull, $rel))
      if (-not $file.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($file)) {
        $res.StatusCode = 404
        $res.ContentType = 'text/plain; charset=utf-8'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
      } else {
        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
        $res.AddHeader('Cache-Control', 'no-cache')
        $bytes = [System.IO.File]::ReadAllBytes($file)
      }
      $res.ContentLength64 = $bytes.Length
      if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    } catch {
      try { $res.StatusCode = 500 } catch { }
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
