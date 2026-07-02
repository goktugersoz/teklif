$ErrorActionPreference = "Stop"

$port = 5179
$php = Get-Command php -ErrorAction Stop
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

if ($listener) {
    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Milliseconds 500
}

Start-Process -FilePath $php.Source -ArgumentList @("-S", "127.0.0.1:$port", "-t", ".") -WorkingDirectory (Get-Location) -WindowStyle Hidden
Start-Sleep -Milliseconds 800

Write-Host "PHP server started: http://127.0.0.1:$port/index.html"
Write-Host "Vendor page example: http://127.0.0.1:$port/vendor.html?firma=KOD"
