<#
.SYNOPSIS
  Maps the demo hostname to the demo host's LAN IP in the hosts file (only when no internal DNS exists).
  Run as Administrator on each Windows client. Discover the IP on the demo host; do not guess it.
.EXAMPLE
  .\add-hosts-entry.ps1 -HostName comms-demo.home.arpa -Address 192.168.x.y
#>
param(
  [Parameter(Mandatory = $true)][string]$HostName,
  [Parameter(Mandatory = $true)][ValidatePattern('^\d{1,3}(\.\d{1,3}){3}$')][string]$Address
)
$ErrorActionPreference = 'Stop'
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
Copy-Item $hosts "$hosts.demo-backup" -Force
$lines = Get-Content $hosts | Where-Object { $_ -notmatch "\s$([regex]::Escape($HostName))(\s|$)" }
$lines += "$Address`t$HostName`t# enterprise-comms-demo"
Set-Content -Path $hosts -Value $lines -Encoding ASCII
ipconfig /flushdns | Out-Null
Write-Host "$HostName -> $Address (backup: $hosts.demo-backup)"
Resolve-DnsName $HostName -ErrorAction SilentlyContinue | Format-Table Name, IPAddress
