<# Removes the hosts entry added by add-hosts-entry.ps1. Run as Administrator. #>
param([Parameter(Mandatory = $true)][string]$HostName)
$ErrorActionPreference = 'Stop'
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$lines = Get-Content $hosts | Where-Object { -not ($_ -match "\s$([regex]::Escape($HostName))(\s|$)" -and $_ -match '# enterprise-comms-demo') }
Set-Content -Path $hosts -Value $lines -Encoding ASCII
ipconfig /flushdns | Out-Null
Write-Host "Removed $HostName"
