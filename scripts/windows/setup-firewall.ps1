<#
.SYNOPSIS
  Opens only the ports the LAN demo needs, limited to the trusted LAN subnet. Run as Administrator.
.EXAMPLE
  .\setup-firewall.ps1 -Subnet 192.168.1.0/24
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d{1,3}(\.\d{1,3}){3}/\d{1,2}$')]
  [string]$Subnet
)
$ErrorActionPreference = 'Stop'

$rules = @(
  @{ Name = 'Enterprise Demo HTTPS';        Protocol = 'TCP'; Port = 443  },
  @{ Name = 'Enterprise Demo LiveKit TCP';  Protocol = 'TCP'; Port = 7881 },
  @{ Name = 'Enterprise Demo LiveKit UDP';  Protocol = 'UDP'; Port = 7882 }
)

foreach ($r in $rules) {
  if (Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue) {
    Write-Host "Updating '$($r.Name)'"
    Set-NetFirewallRule -DisplayName $r.Name -RemoteAddress $Subnet -Enabled True
  } else {
    Write-Host "Creating '$($r.Name)'"
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow `
      -Protocol $r.Protocol -LocalPort $r.Port -RemoteAddress $Subnet -Profile Any | Out-Null
  }
}

Get-NetFirewallRule -DisplayName 'Enterprise Demo*' |
  Format-Table DisplayName, Enabled, Direction, Action -AutoSize
