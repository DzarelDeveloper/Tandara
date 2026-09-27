param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ProjectRoot 'scripts\tandara-windows-common.ps1')
Set-Location $ProjectRoot

Write-Host '========================================'
Write-Host '             TANDARA DEMO'
Write-Host '========================================'

$PythonExe = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $PythonExe)) { throw 'Python environment belum tersedia. Jalankan .\setup-tandara-windows.ps1.' }
if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) { throw 'Frontend dependencies belum tersedia. Jalankan .\setup-tandara-windows.ps1.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm tidak ditemukan. Jalankan setup Windows terlebih dahulu.' }
Assert-TandaraModels $ProjectRoot

$LogDir = Join-Path $ProjectRoot '.logs'
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$BackendLog = Join-Path $LogDir 'backend.log'
$FrontendLog = Join-Path $LogDir 'frontend.log'
Set-Content -Path $BackendLog -Value ''
Set-Content -Path $FrontendLog -Value ''

Stop-TandaraTrackedProcesses $ProjectRoot
$BackendPid = $null
$FrontendPid = $null

$health = Get-TandaraHealth
$portOwner = Get-TandaraPortOwner 8000
if ($health) {
    Write-TandaraStatus 'OK' 'Backend Tandara sudah berjalan di port 8000'
} elseif ($portOwner) {
    Write-TandaraStatus 'ERROR' 'Port 8000 digunakan aplikasi lain.'
    Write-Host "PID: $($portOwner.Pid)"
    Write-Host "Process: $($portOwner.Name)"
    exit 1
} else {
    Write-TandaraStatus 'START' 'Backend'
    $env:PYTHONPATH = 'backend'
    $env:APP_ENV = 'development'
    $backendCommand = "`"$PythonExe`" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >> `"$BackendLog`" 2>&1"
    $backendProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', $backendCommand) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
    $BackendPid = $backendProcess.Id
    Save-TandaraState $ProjectRoot $BackendPid $null
    $health = Wait-TandaraBackend 30
    if (-not $health) { Write-TandaraStatus 'ERROR' "Backend tidak siap. Periksa $BackendLog"; Stop-TandaraTrackedProcesses $ProjectRoot; exit 1 }
}

if ($health.data.status -ne 'ok' -or $health.data.database.status -ne 'connected' -or $health.data.face_recognition -ne 'READY') {
    Write-TandaraStatus 'ERROR' "Health tidak siap: backend=$($health.data.status), database=$($health.data.database.status), face=$($health.data.face_recognition)"
    if ($BackendPid) { Stop-TandaraTrackedProcesses $ProjectRoot }
    exit 1
}
Write-TandaraStatus 'OK' 'Backend READY'
Write-TandaraStatus 'OK' 'Database CONNECTED'
Write-TandaraStatus 'OK' 'Face Engine READY'

$frontendReady = Test-TandaraFrontend
$portOwner = Get-TandaraPortOwner 3000
if ($frontendReady) {
    Write-TandaraStatus 'OK' 'Frontend Tandara sudah berjalan di port 3000'
} elseif ($portOwner) {
    Write-TandaraStatus 'ERROR' 'Port 3000 digunakan aplikasi lain.'
    Write-Host "PID: $($portOwner.Pid)"
    Write-Host "Process: $($portOwner.Name)"
    if ($BackendPid) { Stop-TandaraTrackedProcesses $ProjectRoot }
    exit 1
} else {
    Write-TandaraStatus 'START' 'Frontend'
    $npm = (Get-Command npm.cmd).Source
    $frontendCommand = "`"$npm`" run dev -- --strictPort >> `"$FrontendLog`" 2>&1"
    $frontendProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', $frontendCommand) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
    $FrontendPid = $frontendProcess.Id
    Save-TandaraState $ProjectRoot $BackendPid $FrontendPid
    if (-not (Wait-TandaraFrontend 30)) { Write-TandaraStatus 'ERROR' "Frontend tidak siap. Periksa $FrontendLog"; Stop-TandaraTrackedProcesses $ProjectRoot; exit 1 }
    Write-TandaraStatus 'OK' 'Frontend READY'
}

Show-TandaraCameraInfo
Write-Host '----------------------------------------'
Write-Host 'Tandara siap untuk demo'
Write-Host 'http://localhost:3000'
Write-Host 'Logs: .logs\backend.log dan .logs\frontend.log'
Write-Host 'Stop: .\stop-tandara-windows.ps1'
Write-Host '----------------------------------------'
if (-not $NoBrowser) { Start-Process 'http://localhost:3000' }
