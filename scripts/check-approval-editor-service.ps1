param(
  [string]$ServiceName = "approval-editor-service",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 3042,
  [switch]$IncludeGateway
)

$ErrorActionPreference = "Continue"

function Resolve-OptionalCommandPath {
  param([Parameter(Mandatory = $true)][string]$CommandName)
  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Write-Section {
  param([Parameter(Mandatory = $true)][string]$Title)
  Write-Host "`n== $Title =="
}

function Invoke-HttpCheck {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Uri
  )

  try {
    $response = Invoke-WebRequest -Uri $Uri -Method GET -TimeoutSec 10 -SkipHttpErrorCheck
    $statusCode = [int]$response.StatusCode
    if ($statusCode -ge 200 -and $statusCode -lt 500) {
      Write-Host "[ok] $Name -> HTTP $statusCode $Uri"
    } else {
      Write-Warning "$Name -> HTTP $statusCode $Uri"
    }
  } catch {
    Write-Warning "$Name failed: $($_.Exception.Message)"
  }
}

$LocalBase = "http://${HostName}:$Port"
$GatewayApprovalHealthUri = "http://127.0.0.1:8099/approval/health"
$PublicApprovalHealthUri = "https://api.automatizacionedun8n.me/approval/health"
$NssmPath = Resolve-OptionalCommandPath "nssm.exe"

Write-Section "Windows service"
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
  $service | Select-Object Name, Status, StartType | Format-List
} else {
  Write-Warning "Windows service '$ServiceName' was not found."
}

if ($NssmPath) {
  Write-Host "[info] nssm.exe: $NssmPath"
  if ($service) {
    & $NssmPath status $ServiceName
    & $NssmPath get $ServiceName Application
    & $NssmPath get $ServiceName AppDirectory
    & $NssmPath get $ServiceName AppParameters
  }
} else {
  Write-Warning "nssm.exe was not found on PATH."
}

Write-Section "Local listener"
$listener = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
if ($listener.TcpTestSucceeded) {
  Write-Host "[ok] Listener reachable on ${HostName}:$Port"
} else {
  Write-Warning "No TCP listener reachable on ${HostName}:$Port"
}

Write-Section "Local approval editor smoke"
Invoke-HttpCheck -Name "local approval health" -Uri "$LocalBase/health"

if ($IncludeGateway) {
  Write-Section "Gateway approval smoke"
  Invoke-HttpCheck -Name "gateway approval health" -Uri $GatewayApprovalHealthUri
  Invoke-HttpCheck -Name "public approval health" -Uri $PublicApprovalHealthUri
} else {
  Write-Host "`n[info] Gateway checks skipped. Re-run with -IncludeGateway to check $GatewayApprovalHealthUri and $PublicApprovalHealthUri."
}
