<#
.SYNOPSIS
  Trusts the demo's PUBLIC root CA certificate (rootCA.crt) on a Windows client.
  Chrome and Edge use the Windows certificate store. Restart the browser afterwards.
.PARAMETER Path
  Path to rootCA.crt (copied from infra/certs on the demo host).
.PARAMETER Machine
  Install for all users (LocalMachine, requires Administrator) instead of the current user.
#>
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [switch]$Machine
)
$ErrorActionPreference = 'Stop'
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path $Path).Path)
if ($cert.HasPrivateKey) { throw 'This file contains a private key. Only the public rootCA.crt may be installed on clients.' }
Write-Host "Subject:    $($cert.Subject)"
Write-Host "Thumbprint: $($cert.Thumbprint)"
$store = if ($Machine) { 'Cert:\LocalMachine\Root' } else { 'Cert:\CurrentUser\Root' }
Import-Certificate -FilePath $Path -CertStoreLocation $store | Out-Null
Write-Host "Installed into $store. Restart Chrome/Edge, then open the demo URL."
