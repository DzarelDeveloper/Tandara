param([string]$OutputPath)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ProjectRoot 'scripts\tandara-windows-common.ps1')
if (-not $OutputPath) { $OutputPath = Join-Path (Split-Path -Parent $ProjectRoot) 'tandara-windows-demo.zip' }
Assert-TandaraModels $ProjectRoot

$stage = Join-Path ([IO.Path]::GetTempPath()) ("tandara-demo-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $excludedDirectories = @('.git', '.venv', 'node_modules', 'dist', '.logs', '.runtime', (Join-Path $ProjectRoot 'backend\data\faces'), (Join-Path $ProjectRoot 'backend\__pycache__'))
    & robocopy.exe $ProjectRoot $stage /E /NFL /NDL /NJH /NJS /NP /XD $excludedDirectories /XF .env backend\.env '*.db' '*.pyc'
    if ($LASTEXITCODE -gt 7) { throw "robocopy gagal dengan exit code $LASTEXITCODE." }
    if (Test-Path $OutputPath) { Remove-Item $OutputPath -Force }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $OutputPath -CompressionLevel Optimal
    Write-TandaraStatus 'OK' "Paket demo dibuat: $OutputPath"
    Write-TandaraStatus 'OK' 'Paket tidak memuat .venv Linux, node_modules, database, embeddings, log, atau .env.'
} finally {
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
