# Automated Crypto Trading Bot Startup
# Handles database initialization and bot startup

Write-Host "`n🤖 Starting Crypto Trading Bot...`n" -ForegroundColor Cyan

# Stop any existing node processes
Write-Host "🛑 Stopping any existing bot instances..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Change to script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Run the automated startup script
$Instance = if ($args.Count -gt 0) { $args[0] } else { "instance.paper.15m.js" }

Write-Host "🚀 Launching with instance: $Instance`n" -ForegroundColor Green

node start-bot.js $Instance

# Keep window open if there's an error
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Bot exited with error code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
