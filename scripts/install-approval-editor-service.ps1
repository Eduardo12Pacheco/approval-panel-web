param(
  [string]$ServiceName = "approval-editor-service"
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator privileges are required to install or update the '$ServiceName' Windows service. Re-run PowerShell as Administrator and execute this script again."
  }
}

function Resolve-CommandPath {
  param([Parameter(Mandatory = $true)][string]$CommandName)
  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Required command '$CommandName' was not found on PATH."
  }
  return $command.Source
}

function Invoke-Nssm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & $script:NssmPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "nssm.exe $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

Assert-Administrator

$PanelRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeLogDir = Join-Path $PanelRoot "runtime-logs"
$StdoutLog = Join-Path $RuntimeLogDir "approval-editor-service.out.log"
$StderrLog = Join-Path $RuntimeLogDir "approval-editor-service.err.log"

New-Item -ItemType Directory -Path $RuntimeLogDir -Force | Out-Null

$script:NssmPath = Resolve-CommandPath "nssm.exe"
$NodePath = Resolve-CommandPath "node.exe"
$ExistingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if (-not $ExistingService) {
  Invoke-Nssm install $ServiceName $NodePath "services/approval-editor/server.js"
} else {
  Write-Host "[info] Updating existing service '$ServiceName'."
}

Invoke-Nssm set $ServiceName Application $NodePath
Invoke-Nssm set $ServiceName AppParameters "services/approval-editor/server.js"
Invoke-Nssm set $ServiceName AppDirectory $PanelRoot
Invoke-Nssm set $ServiceName DisplayName "Approval Editor Service"
Invoke-Nssm set $ServiceName Description "Local Approval Editor runtime service for Control Panel snapshots, contracts, renders, and downloads."
Invoke-Nssm set $ServiceName Start SERVICE_AUTO_START
Invoke-Nssm set $ServiceName AppStdout $StdoutLog
Invoke-Nssm set $ServiceName AppStderr $StderrLog
Invoke-Nssm set $ServiceName AppRotateFiles 1
Invoke-Nssm set $ServiceName AppRotateOnline 1
Invoke-Nssm set $ServiceName AppRotateBytes 10485760

$Service = Get-Service -Name $ServiceName -ErrorAction Stop
if ($Service.Status -eq "Running") {
  Write-Host "[info] Restarting '$ServiceName' to apply configuration."
  Restart-Service -Name $ServiceName -Force -ErrorAction Stop
} else {
  Write-Host "[info] Starting '$ServiceName'."
  Start-Service -Name $ServiceName -ErrorAction Stop
}

Invoke-Nssm status $ServiceName
Write-Host "[ok] Service '$ServiceName' is installed/updated. Logs: $RuntimeLogDir"
