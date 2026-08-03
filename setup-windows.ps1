#Requires -Version 5.1
<#
.SYNOPSIS
  Installs the native-messaging companion for the Authorized Chrome QA Launcher.

.EXAMPLE
  .\setup-windows.ps1 abcdefghijklmnopabcdefghijklmnop
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js 20 or newer is required and was not found on PATH.'
}

$version = (& node --version).TrimStart('v')
if ([int]($version.Split('.')[0]) -lt 20) {
  throw "Node.js 20 or newer is required; found $version."
}

$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
if (-not ($chromePaths | Where-Object { Test-Path $_ })) {
  throw 'Google Chrome was not found in the standard installation paths.'
}

Push-Location (Join-Path $scriptDir 'native-host')
try {
  & npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
}
finally {
  Pop-Location
}

& node (Join-Path $scriptDir 'scripts\install-native-host.mjs') $ExtensionId
if ($LASTEXITCODE -ne 0) { throw 'Native host registration failed.' }

Write-Output 'Setup complete. Reload the extension from chrome://extensions.'
