$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ProjectRoot 'scripts\tandara-windows-common.ps1')
Write-TandaraStatus 'STOP' 'Menghentikan proses Tandara yang tercatat...'
Stop-TandaraTrackedProcesses $ProjectRoot
Write-TandaraStatus 'OK' 'Selesai. Proses tanpa bukti kepemilikan tidak disentuh.'
