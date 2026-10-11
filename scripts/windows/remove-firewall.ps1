<# Removes only the firewall rules created for this demo. Run as Administrator. #>
$ErrorActionPreference = 'Stop'
foreach ($name in 'Enterprise Demo HTTPS', 'Enterprise Demo LiveKit TCP', 'Enterprise Demo LiveKit UDP') {
  if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $name
    Write-Host "Removed '$name'"
  }
}
