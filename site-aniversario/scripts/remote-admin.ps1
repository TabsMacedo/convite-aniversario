param(
  [ValidateSet('Read', 'SetCompanions', 'ResetCompanions')][string]$Action = 'Read',
  [string]$ResponseId,
  [string[]]$Companions = @(),
  [switch]$Configure
)

$ErrorActionPreference = 'Stop'
$origin = 'https://tabata-party.onrender.com'
$privateDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.qa'))
$credentialPath = Join-Path $privateDirectory 'render-admin.credential.xml'

if ($Configure -or -not (Test-Path -LiteralPath $credentialPath)) {
  New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
  Get-Credential -UserName 'Tabata' -Message 'Senha do painel do site. Guardada com a protecao do seu usuario Windows.' | Export-Clixml -LiteralPath $credentialPath
}

# O Windows protege a senha com DPAPI; o arquivo nao pode ser usado por outro usuario.
# A pasta .qa esta fora do Git. Nenhuma senha, cookie ou JWT e impresso.
$credential = Import-Clixml -LiteralPath $credentialPath
if ($credential -isnot [System.Management.Automation.PSCredential]) { throw 'Reconfigure a credencial com -Configure no seu usuario Windows.' }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers = @{ Origin = $origin }
$loggedIn = $false
try {
  $body = @{ password = $credential.GetNetworkCredential().Password } | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "$origin/api/admin/login" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -WebSession $session -Headers $headers -TimeoutSec 30 | Out-Null
  $loggedIn = $true
  if ($Action -ne 'Read') {
    if (-not $ResponseId) { throw 'Informe o identificador da resposta.' }
    $body = @{ response_id = $ResponseId; companions = @($Companions); reset = ($Action -eq 'ResetCompanions') } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri "$origin/api/admin/companions" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -WebSession $session -Headers $headers -TimeoutSec 30 | Out-Null
  }
  Invoke-RestMethod -Uri "$origin/api/admin/responses" -WebSession $session -TimeoutSec 30 | ConvertTo-Json -Depth 20
} finally {
  if ($loggedIn) {
    try { Invoke-RestMethod -Uri "$origin/api/admin/logout" -Method Post -ContentType 'application/json' -Body '{}' -WebSession $session -Headers $headers -TimeoutSec 15 | Out-Null }
    catch { Write-Warning 'Nao foi possivel encerrar esta sessao; ela expira automaticamente.' }
  }
}
