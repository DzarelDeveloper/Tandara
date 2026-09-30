param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ProjectRoot 'scripts\tandara-windows-common.ps1')
Set-Location $ProjectRoot

Write-Host '========================================'
Write-Host '          TANDARA WINDOWS SETUP'
Write-Host '========================================'
if ($env:OS -ne 'Windows_NT') { throw 'Script ini hanya untuk Windows 10/11 native.' }
if ([Environment]::OSVersion.Version.Major -lt 10) { throw 'Tandara membutuhkan Windows 10 atau Windows 11.' }
Write-TandaraStatus 'OK' ([System.Environment]::OSVersion.VersionString)

foreach ($required in @('backend\app\main.py', 'backend\requirements.txt', 'package.json', 'package-lock.json')) {
    if (-not (Test-Path (Join-Path $ProjectRoot $required))) { throw "Struktur project tidak lengkap: $required" }
}
Write-TandaraStatus 'OK' 'Project structure'

function Refresh-ProcessPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Install-WithWinget {
    param([string]$Id, [string]$Label)
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw "$Label tidak ditemukan dan winget tidak tersedia. Install $Label dari sumber resmi lalu jalankan ulang setup." }
    Write-TandaraStatus 'INSTALL' "$Label melalui winget ($Id)"
    & winget.exe install --id $Id --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Instalasi $Label gagal dengan exit code $LASTEXITCODE." }
    Refresh-ProcessPath
}

function Get-Python312 {
    if (Get-Command py.exe -ErrorAction SilentlyContinue) {
        & py.exe -3.12 --version *> $null
        if ($LASTEXITCODE -eq 0) { return [PSCustomObject]@{ File='py.exe'; Prefix=@('-3.12') } }
    }
    foreach ($name in @('python.exe', 'python3.exe')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            $version = & $command.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
            if ($version -eq '3.12') { return [PSCustomObject]@{ File=$command.Source; Prefix=@() } }
        }
    }
    return $null
}

$python = Get-Python312
if (-not $python) {
    Install-WithWinget 'Python.Python.3.12' 'Python 3.12'
    $python = Get-Python312
    if (-not $python) { throw 'Python 3.12 telah diinstall tetapi belum dapat ditemukan. Tutup PowerShell, buka kembali, lalu ulangi setup.' }
}
$pythonVersionArgs = @($python.Prefix) + @('--version')
Write-TandaraStatus 'OK' (& $python.File @pythonVersionArgs 2>&1)

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS' }
Initialize-TandaraNodePath
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Refresh-ProcessPath }
Initialize-TandaraNodePath
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm tidak ditemukan setelah instalasi Node.js.' }
Write-TandaraStatus 'OK' "Node.js $(& node.exe --version)"
Write-TandaraStatus 'OK' "npm $(& npm.cmd --version)"
if (Get-Command git.exe -ErrorAction SilentlyContinue) { Write-TandaraStatus 'OK' "Git $(& git.exe --version)" } else { Write-TandaraStatus 'WARN' 'Git tidak ditemukan; project tetap dapat dijalankan dari folder hasil copy/ZIP.' }

$VenvPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $VenvPython)) {
    Write-TandaraStatus 'SETUP' 'Membuat Python virtual environment'
    $venvArgs = @($python.Prefix) + @('-m', 'venv', '.venv')
    & $python.File @venvArgs
    if ($LASTEXITCODE -ne 0) { throw 'Gagal membuat .venv.' }
}
Write-TandaraStatus 'OK' 'Python environment'

& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Gagal memperbarui pip.' }
& $VenvPython -m pip install -r (Join-Path $ProjectRoot 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Gagal menginstall backend dependencies.' }
Write-TandaraStatus 'OK' 'Backend dependencies'

& $VenvPython -c "import fastapi, uvicorn, sqlalchemy, cv2, numpy, jwt, argon2; print('Python imports OK')"
if ($LASTEXITCODE -ne 0) { throw 'Validasi dependency Python gagal.' }
Assert-TandaraModels $ProjectRoot

if (-not (Test-Path (Join-Path $ProjectRoot '.env'))) {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes); $rng.Dispose()
    $secret = [Convert]::ToBase64String($bytes)
    $content = Get-Content (Join-Path $ProjectRoot '.env.example') -Raw
    $content = $content -replace '(?m)^SECRET_KEY=.*$', "SECRET_KEY=$secret"
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $ProjectRoot '.env'), $content, $utf8)
    Write-TandaraStatus 'OK' 'Local .env dibuat dengan JWT secret acak'
} else { Write-TandaraStatus 'OK' '.env existing dipertahankan' }

$env:PYTHONPATH = 'backend'
$env:APP_ENV = 'development'
& $VenvPython -m app.cli.init_demo
if ($LASTEXITCODE -ne 0) { throw 'Inisialisasi database demo gagal.' }
Write-TandaraStatus 'OK' 'Database initialized non-destructively'

Write-TandaraStatus 'SETUP' 'Menginstall frontend dependencies dengan npm ci'
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci gagal.' }
Write-TandaraStatus 'OK' 'Frontend dependencies'

& (Join-Path $ProjectRoot 'start-tandara-windows.ps1') -NoBrowser:$NoBrowser
