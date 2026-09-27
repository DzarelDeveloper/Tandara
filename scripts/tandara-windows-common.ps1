$ErrorActionPreference = 'Stop'

function Write-TandaraStatus {
    param([string]$Level, [string]$Message)
    Write-Host ("[{0}] {1}" -f $Level, $Message)
}

function Get-TandaraHealth {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        if ($health.success -eq $true -and $health.message -eq 'Backend Tandara aktif') { return $health }
    } catch { }
    try {
        $line = netstat.exe -ano -p tcp | Where-Object { $_ -match ":$Port\s+.*LISTENING\s+(\d+)\s*$" } | Select-Object -First 1
        if ($line -and $line -match 'LISTENING\s+(\d+)\s*$') {
            $pidValue = [int]$Matches[1]
            $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
            return [PSCustomObject]@{ Pid = $pidValue; Name = if ($process) { $process.ProcessName } else { 'Unknown' } }
        }
    } catch { }
    return $null
}

function Test-TandaraFrontend {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -eq 200 -and $response.Content -match 'Tandara')
    } catch { return $false }
}

function Get-TandaraPortOwner {
    param([int]$Port)
    try {
        $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
        if ($connection) {
            $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
            return [PSCustomObject]@{ Pid = $connection.OwningProcess; Name = if ($process) { $process.ProcessName } else { 'Unknown' } }
        }
    } catch { }
    return $null
}

function Assert-TandaraModels {
    param([string]$ProjectRoot)
    $models = @(
        @{ Name = 'YuNet'; Path = Join-Path $ProjectRoot 'backend\ml_models\yunet_face_detection.onnx'; Hash = '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4' },
        @{ Name = 'SFace'; Path = Join-Path $ProjectRoot 'backend\ml_models\face_recognition_sface.onnx'; Hash = '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79' }
    )
    foreach ($model in $models) {
        if (-not (Test-Path $model.Path -PathType Leaf)) { throw "Model $($model.Name) tidak ditemukan: $($model.Path)" }
        $actual = (Get-FileHash -Path $model.Path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $model.Hash) { throw "Checksum model $($model.Name) tidak valid. File ditolak." }
        Write-TandaraStatus 'OK' "$($model.Name) verified"
    }
}

function Get-TandaraStatePath {
    param([string]$ProjectRoot)
    return Join-Path $ProjectRoot '.runtime\tandara-windows.json'
}

function Save-TandaraState {
    param([string]$ProjectRoot, [Nullable[int]]$BackendPid, [Nullable[int]]$FrontendPid)
    $runtime = Join-Path $ProjectRoot '.runtime'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    [PSCustomObject]@{ ProjectRoot = $ProjectRoot; BackendPid = $BackendPid; FrontendPid = $FrontendPid; CreatedAt = (Get-Date).ToString('o') } |
        ConvertTo-Json | Set-Content -Path (Get-TandaraStatePath $ProjectRoot) -Encoding UTF8
}

function Stop-TandaraTrackedProcesses {
    param([string]$ProjectRoot)
    $statePath = Get-TandaraStatePath $ProjectRoot
    if (-not (Test-Path $statePath)) { return }
    try { $state = Get-Content $statePath -Raw | ConvertFrom-Json } catch { Write-TandaraStatus 'WARN' 'State file tidak valid; tidak ada proses yang dihentikan.'; return }
    if ($state.ProjectRoot -ne $ProjectRoot) { Write-TandaraStatus 'WARN' 'State file bukan milik project ini; proses tidak dihentikan.'; return }

    $unsafe = $false
    foreach ($entry in @(@{ Label='Frontend'; Pid=$state.FrontendPid; Marker='run dev' }, @{ Label='Backend'; Pid=$state.BackendPid; Marker='uvicorn app.main:app' })) {
        if (-not $entry.Pid) { continue }
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.Pid)" -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        $command = [string]$process.CommandLine
        if ($command -notlike "*$($entry.Marker)*" -or $command -notlike "*$ProjectRoot*") {
            Write-TandaraStatus 'WARN' "$($entry.Label) PID $($entry.Pid) tidak dapat dibuktikan milik Tandara; tidak dihentikan."
            $unsafe = $true
            continue
        }
        & taskkill.exe /PID $entry.Pid /T /F | Out-Null
        Write-TandaraStatus 'OK' "$($entry.Label) lama dihentikan"
    }
    if (-not $unsafe) { Remove-Item $statePath -Force -ErrorAction SilentlyContinue }
}

function Wait-TandaraBackend {
    param([int]$TimeoutSeconds = 30)
    for ($attempt = 1; $attempt -le $TimeoutSeconds; $attempt++) {
        $health = Get-TandaraHealth
        if ($health) { return $health }
        Start-Sleep -Seconds 1
    }
    return $null
}

function Wait-TandaraFrontend {
    param([int]$TimeoutSeconds = 30)
    for ($attempt = 1; $attempt -le $TimeoutSeconds; $attempt++) {
        if (Test-TandaraFrontend) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Show-TandaraCameraInfo {
    $devices = @()
    try {
        if (Get-Command Get-PnpDevice -ErrorAction SilentlyContinue) {
            $devices = @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object { $_.Class -in @('Camera', 'Image') -and $_.Status -eq 'OK' })
        }
    } catch { }
    if ($devices.Count -gt 0) {
        Write-TandaraStatus 'CAMERA' (($devices | ForEach-Object FriendlyName) -join ', ')
        if (($devices | ForEach-Object FriendlyName) -match 'DroidCam') { Write-TandaraStatus 'OK' 'DroidCam terdeteksi' }
    } else {
        Write-TandaraStatus 'WARN' 'Kamera tidak dapat dideteksi dari PowerShell. Built-in/USB webcam tetap dapat dipilih di browser.'
    }
    Write-TandaraStatus 'CAMERA' 'DroidCam direkomendasikan untuk kualitas demo terbaik.'
}
