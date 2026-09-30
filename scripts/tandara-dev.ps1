param([switch]$Setup, [switch]$Stop)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackendDir = Join-Path $ProjectRoot 'backend'
$RuntimeDir = Join-Path $ProjectRoot '.runtime'
$LogDir = Join-Path $ProjectRoot '.logs'
$BackendPort = if ($env:TANDARA_BACKEND_PORT) { [int]$env:TANDARA_BACKEND_PORT } else { 8000 }
$FrontendPort = if ($env:TANDARA_FRONTEND_PORT) { [int]$env:TANDARA_FRONTEND_PORT } else { 3000 }
$BackendUrl = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://localhost:$FrontendPort"
$StartedBackend = $null
$StartedFrontend = $null
$BackendLog = Join-Path $LogDir 'backend-dev.log'
$BackendErrorLog = Join-Path $LogDir 'backend-dev-error.log'
$FrontendLog = Join-Path $LogDir 'frontend-dev.log'
$FrontendErrorLog = Join-Path $LogDir 'frontend-dev-error.log'

function Write-Status([string]$Message) { Write-Host $Message }
function Fail([string]$Message) { throw $Message }

function Get-PythonExecutable {
    if ($env:TANDARA_PYTHON -and (Test-Path $env:TANDARA_PYTHON)) { return $env:TANDARA_PYTHON }
    foreach ($candidate in @(
        (Join-Path $ProjectRoot '.venv\Scripts\python.exe'),
        (Join-Path $BackendDir '.venv\Scripts\python.exe')
    )) { if (Test-Path $candidate) { return $candidate } }
    return $null
}

function Get-PortOwner([int]$Port) {
    try {
        $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
        if ($connection) {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
            return [PSCustomObject]@{ Pid = $connection.OwningProcess; Name = if ($process) { $process.Name } else { 'Unknown' }; CommandLine = if ($process) { $process.CommandLine } else { '' } }
        }
    } catch { }
    return $null
}

function Get-TandaraHealth {
    try {
        $health = Invoke-RestMethod -Uri "$BackendUrl/api/health" -TimeoutSec 2
        if ($health.success -eq $true -and $health.message -eq 'Backend Tandara aktif') { return $health }
    } catch { }
    return $null
}

function Test-Frontend {
    try {
        $response = Invoke-WebRequest -Uri "$FrontendUrl/" -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match '<title>[^<]*Tandara|content="[^"]*Tandara'
    } catch { return $false }
}

function Get-ConfiguredModels([string]$PythonExe) {
    $env:PYTHONPATH = $BackendDir
    $env:APP_ENV = 'development'
    $output = & $PythonExe -c "from app.config import settings; print(settings.face_detector_model); print(settings.face_recognizer_model); print(settings.database_url.split(':', 1)[0])" 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "Could not load backend config/dependencies: $output" }
    return @($output | Where-Object { $_ -is [string] })
}

function Test-Dependencies([string]$PythonExe) {
    $code = "import fastapi, uvicorn, sqlalchemy, pydantic_settings, cv2, numpy, jwt, argon2, multipart"
    & $PythonExe -c $code *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'Backend dependencies are incomplete. Run setup.bat.' }
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { Fail 'Node.js is missing. Install Node.js LTS, then run setup.bat.' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Fail 'npm is missing from PATH. Install Node.js LTS, then run setup.bat.' }
    if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules\.bin\vite.cmd'))) { Fail 'Frontend node_modules missing. Run setup.bat.' }
}

function Stop-StartedProcess($Process, [string]$Label, [string]$Marker) {
    if (-not $Process) { return }
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Process.Id)" -ErrorAction SilentlyContinue
    $pidFile = Join-Path $RuntimeDir ("{0}.pid" -f $Label.ToLowerInvariant())
    if (-not $current) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue; return }
    $command = [string]$current.CommandLine
    if ($command -notlike "*$ProjectRoot*" -or $command -notlike "*$Marker*") {
        Write-Status "$Label PID $($Process.Id) no longer matches this Tandara child; not stopping it."
        return
    }
    & taskkill.exe /PID $Process.Id /T /F | Out-Null
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Status "$Label child stopped."
}

function Stop-RecordedProcesses {
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    foreach ($entry in @(
        @{ Label = 'frontend'; Marker = 'npm.cmd' },
        @{ Label = 'backend'; Marker = 'uvicorn app.main:app' }
    )) {
        $pidFile = Join-Path $RuntimeDir ($entry.Label + '.pid')
        if (-not (Test-Path $pidFile)) { continue }
        $rawPid = (Get-Content $pidFile -Raw).Trim()
        $processId = 0
        if (-not [int]::TryParse($rawPid, [ref]$processId)) { Write-Status "Ignoring invalid $($entry.Label) PID record."; continue }
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
        if (-not $process) { Remove-Item $pidFile -Force; continue }
        $command = [string]$process.CommandLine
        if ($command -notlike "*$ProjectRoot*" -or $command -notlike "*$($entry.Marker)*") {
            Write-Status "Not stopping $($entry.Label) PID ${processId}: command does not prove this Tandara project owns it."
            continue
        }
        & taskkill.exe /PID $processId /T /F | Out-Null
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        Write-Status "Stopped recorded Tandara $($entry.Label) process tree ($processId)."
    }
}

function Wait-Backend([int]$Seconds) {
    for ($i = 0; $i -lt $Seconds * 2; $i++) {
        $health = Get-TandaraHealth
        if ($health) { return $health }
        if ($StartedBackend -and $StartedBackend.HasExited) { return $null }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Wait-Frontend([int]$Seconds) {
    for ($i = 0; $i -lt $Seconds * 2; $i++) {
        if (Test-Frontend) { return $true }
        if ($StartedFrontend -and $StartedFrontend.HasExited) { return $false }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Initialize-Setup {
    if (-not (Test-Path (Join-Path $ProjectRoot 'backend\requirements.txt')) -or -not (Test-Path (Join-Path $ProjectRoot 'package-lock.json'))) { Fail 'Project dependencies/lockfiles are missing.' }
    $python = Get-PythonExecutable
    if (-not $python) {
        $basePython = $null
        if (Get-Command py.exe -ErrorAction SilentlyContinue) {
            & py.exe -3.12 --version *> $null
            if ($LASTEXITCODE -eq 0) { $basePython = 'py.exe' }
        }
        if (-not $basePython) {
            $command = Get-Command python.exe -ErrorAction SilentlyContinue
            if ($command) { $basePython = $command.Source }
        }
        if (-not $basePython) { Fail 'Python 3.12+ is required. Install Python, then run setup.bat again.' }
        $venv = Join-Path $ProjectRoot '.venv'
        if ($basePython -eq 'py.exe') { & py.exe -3.12 -m venv $venv }
        else { & $basePython -m venv $venv }
        if ($LASTEXITCODE -ne 0) { Fail 'Could not create root .venv.' }
        $python = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
    }
    $baseVersion = & $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    $baseParts = $baseVersion.Split('.') | ForEach-Object { [int]$_ }
    if ($baseParts[0] -lt 3 -or ($baseParts[0] -eq 3 -and $baseParts[1] -lt 12)) { Fail "Python 3.12+ required; found $baseVersion." }
    if (-not (Test-Path (Join-Path $ProjectRoot '.env'))) {
        $template = Join-Path $ProjectRoot '.env.example'
        if (-not (Test-Path $template)) { Fail 'Missing root .env.example.' }
        $bytes = New-Object byte[] 48
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($bytes)
        $rng.Dispose()
        $secret = [Convert]::ToBase64String($bytes)
        $content = [IO.File]::ReadAllText($template).Replace('SECRET_KEY=replace-with-a-random-secret-of-at-least-32-bytes', "SECRET_KEY=$secret")
        [IO.File]::WriteAllText((Join-Path $ProjectRoot '.env'), $content, (New-Object System.Text.UTF8Encoding($false)))
        Write-Status 'Created .env from template with a random local secret.'
    } else { Write-Status 'Preserved existing .env.' }
    foreach ($model in @('backend\ml_models\yunet_face_detection.onnx', 'backend\ml_models\face_recognition_sface.onnx')) {
        if (-not (Test-Path (Join-Path $ProjectRoot $model))) { Fail "Required model missing: $model. Restore the provided model; setup does not download models." }
    }
    & $python -m pip install -r (Join-Path $BackendDir 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { Fail 'Backend dependency installation failed.' }
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
    if (-not $npm) { Fail 'Install Node.js LTS, then rerun setup.bat.' }
    Push-Location $ProjectRoot
    try { & $npm.Source ci; if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed.' } }
    finally { Pop-Location }
    Write-Status 'Setup complete. Start Tandara with start.bat.'
}

function Start-Tandara {
    if (-not (Test-Path (Join-Path $ProjectRoot '.env'))) { Fail 'Root .env is missing. Run setup.bat; existing .env files are never overwritten.' }
    if (-not (Test-Path (Join-Path $ProjectRoot '.env.example'))) { Fail 'Root .env.example is missing.' }
    $python = Get-PythonExecutable
    if (-not $python) { Fail 'Python venv not found (.venv or backend/.venv). Run setup.bat.' }
    Test-Dependencies $python
    $version = & $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    $versionParts = $version.Split('.') | ForEach-Object { [int]$_ }
    if ($versionParts[0] -lt 3 -or ($versionParts[0] -eq 3 -and $versionParts[1] -lt 12)) { Fail "Python 3.12+ required; found $version." }
    $models = Get-ConfiguredModels $python
    if ($models.Count -lt 3) { Fail 'Could not resolve configured models/database from backend settings.' }
    foreach ($model in $models[0..1]) { if (-not (Test-Path $model -PathType Leaf)) { Fail "Required face model not found: $model. Restore the provided model; setup will not download models." } }
    New-Item -ItemType Directory -Path $LogDir,$RuntimeDir -Force | Out-Null
    $env:APP_ENV = 'development'
    $env:PYTHONPATH = $BackendDir
    $env:FRONTEND_ORIGIN = "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort,http://localhost:3000,http://localhost:5173"
    $env:VITE_API_URL = $BackendUrl

    $health = Get-TandaraHealth
    if ($health) {
        if ($health.data.status -ne 'ok' -or $health.data.database.status -ne 'connected' -or $health.data.face_recognition -ne 'READY') { Fail "Existing Tandara backend is degraded: app=$($health.data.status), database=$($health.data.database.status), face=$($health.data.face_recognition). No process was stopped." }
        Write-Status "Backend already running and healthy on :$BackendPort"
    } else {
        $owner = Get-PortOwner $BackendPort
        if ($owner) { Fail "Port $BackendPort is occupied by PID $($owner.Pid) ($($owner.Name)): $($owner.CommandLine). It is not a healthy Tandara backend; inspect it manually. No process was stopped." }
        Write-Status '[1/4] Backend starting...'
        Set-Content -Path $BackendLog -Value ''
        Set-Content -Path $BackendErrorLog -Value ''
        $StartedBackend = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port',"$BackendPort") -WorkingDirectory $BackendDir -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendErrorLog -PassThru -WindowStyle Hidden
        $StartedBackend | Select-Object -ExpandProperty Id | Set-Content (Join-Path $RuntimeDir 'backend.pid')
        Write-Status '[2/4] Waiting for backend health (max 30 seconds)...'
        $health = Wait-Backend 30
        if (-not $health) { Get-Content $BackendLog,$BackendErrorLog -Tail 30 -ErrorAction SilentlyContinue; Fail 'Tandara backend failed to start.' }
        if ($health.data.status -ne 'ok' -or $health.data.database.status -ne 'connected' -or $health.data.face_recognition -ne 'READY') { Fail 'Backend responded but database/face engine is not ready.' }
        Write-Status 'Backend health: OK'
    }

    if (Test-Frontend) { Write-Status "Frontend already running and healthy on :$FrontendPort" }
    else {
        $owner = Get-PortOwner $FrontendPort
        if ($owner) { Fail "Port $FrontendPort is occupied by PID $($owner.Pid) ($($owner.Name)): $($owner.CommandLine). No process was stopped." }
        Write-Status '[3/4] Backend ready'
        Write-Status '[4/4] Starting frontend...'
        Set-Content -Path $FrontendLog -Value ''
        Set-Content -Path $FrontendErrorLog -Value ''
        $npm = (Get-Command npm.cmd).Source
        $command = 'cd /d "' + $ProjectRoot + '" && call "' + $npm + '" run dev -- --port ' + $FrontendPort + ' --strictPort'
        $cmdArguments = '/d /s /c "' + $command + '"'
        $StartedFrontend = Start-Process -FilePath $env:ComSpec -ArgumentList $cmdArguments -WorkingDirectory $ProjectRoot -RedirectStandardOutput $FrontendLog -RedirectStandardError $FrontendErrorLog -PassThru -WindowStyle Hidden
        $StartedFrontend | Select-Object -ExpandProperty Id | Set-Content (Join-Path $RuntimeDir 'frontend.pid')
        if (-not (Wait-Frontend 30)) { Get-Content $FrontendLog,$FrontendErrorLog -Tail 30 -ErrorAction SilentlyContinue; Fail 'Tandara frontend failed to start.' }
    }

    Write-Host ''
    Write-Host '----------------------------------------'
    Write-Host 'Tandara is running'
    Write-Host "Frontend: $FrontendUrl"
    Write-Host "Backend : $BackendUrl"
    Write-Host "Swagger : $BackendUrl/docs"
    Write-Host 'Logs    : .logs\backend-dev.log and frontend-dev.log'
    Write-Host 'Press Ctrl+C to stop only children started by this launcher.'
    Write-Host 'Pre-existing healthy services are reused and left running.'
    Write-Host '----------------------------------------'

    while ($true) {
        if ($StartedBackend -and $StartedBackend.HasExited) { Fail 'Backend child exited; inspect .logs\backend-dev*.log.' }
        if ($StartedFrontend -and $StartedFrontend.HasExited) { Fail 'Frontend child exited; inspect .logs\frontend-dev*.log.' }
        Start-Sleep -Seconds 1
    }
}

try {
    if ($Stop) { Stop-RecordedProcesses }
    elseif ($Setup) { Initialize-Setup }
    else { Start-Tandara }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Stop-StartedProcess $StartedFrontend 'Frontend' 'npm.cmd'
    Stop-StartedProcess $StartedBackend 'Backend' 'uvicorn app.main:app'
}