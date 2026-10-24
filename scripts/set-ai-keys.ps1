<#
.SYNOPSIS
    Ajoute ou met a jour les cles du conseiller IA (Mistral, Gemini) dans .env.demo du VPS, par SSH.

.DESCRIPTION
    Etape 1 : copie .env.demo du serveur sur le PC (Documents\tsena-pro-backups) ;
    Etape 2 : demande les deux cles sans les afficher ;
    Etape 3 : sur le serveur, sauvegarde .env.demo (backups/env/) puis remplace ou ajoute
              MISTRAL_API_KEY, MISTRAL_MODEL, GEMINI_API_KEY, GEMINI_MODEL ;
    Etape 4 : propose de relancer le backend (sinon : lancer deploy-demo.ps1).
    Les cles passent par l'entree standard de SSH, jamais sur la ligne de commande.

.EXAMPLE
    .\scripts\set-ai-keys.ps1
.EXAMPLE
    .\scripts\set-ai-keys.ps1 -Restart      # relance le backend sans poser la question
#>
[CmdletBinding()]
param(
    [string]$Server = '167.86.111.192',
    [string]$User = 'root',
    [int]$Port = 22,
    [string]$KeyPath,
    [string]$RemoteDir = '/opt/tsena-pro',
    [string]$MistralModel = 'ministral-8b-latest',
    [string]$GeminiModel = 'gemini-3.1-flash-lite',
    # Dossier de la sauvegarde locale de .env.demo
    [string]$BackupDir = (Join-Path $HOME 'Documents\tsena-pro-backups'),
    # Relancer le backend sans poser la question
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Stop-Script([string]$Message) { Write-Host "`nERREUR : $Message" -ForegroundColor Red; exit 1 }
function ConvertTo-ShellQuoted([string]$Value) { "'" + ($Value -replace "'", "'\''") + "'" }
function Read-Secret([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Stop-Script "ssh introuvable. Installez le client OpenSSH de Windows."
}
if ($Server -notmatch '^[A-Za-z0-9._-]+$') { Stop-Script "Adresse de serveur invalide : $Server" }
if ($RemoteDir -notmatch '^/[A-Za-z0-9._/-]+$') { Stop-Script "RemoteDir invalide : $RemoteDir" }
if ($KeyPath -and -not (Test-Path $KeyPath)) { Stop-Script "Cle SSH introuvable : $KeyPath" }

$target = "$User@$Server"
$sshArgs = @('-p', $Port, '-o', 'StrictHostKeyChecking=accept-new')
$scpArgs = @('-P', $Port, '-o', 'StrictHostKeyChecking=accept-new')
if ($KeyPath) { $sshArgs += @('-i', $KeyPath); $scpArgs += @('-i', $KeyPath) }

# --- Etape 1 : sauvegarde locale ------------------------------------------------------------------
Write-Step "Etape 1 : sauvegarde de .env.demo sur ce PC"
New-Item -ItemType Directory -Force $BackupDir | Out-Null
$localBackup = Join-Path $BackupDir "env.demo.$(Get-Date -Format yyyyMMdd-HHmmss).bak"
& scp @scpArgs "${target}:$RemoteDir/.env.demo" $localBackup
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $localBackup) -or (Get-Item $localBackup).Length -eq 0) {
    Stop-Script "la sauvegarde locale a echoue : rien n'a ete modifie (la demo a-t-elle deja ete deployee ?)."
}
Write-Host "Sauvegarde locale : $localBackup" -ForegroundColor Green
Write-Host "(contient tous les secrets de la demo : ne pas la commiter ni la partager)"

# --- Etape 2 : saisie des cles --------------------------------------------------------------------
Write-Step "Etape 2 : saisie des cles (rien ne s'affiche pendant la saisie, c'est normal)"
$mistralKey = Read-Secret 'Cle Mistral (MISTRAL_API_KEY)'
$geminiKey = Read-Secret 'Cle Gemini  (GEMINI_API_KEY) '
if (-not $mistralKey) { Stop-Script "cle Mistral vide, rien n'a ete modifie." }
if (-not $geminiKey) { Stop-Script "cle Gemini vide, rien n'a ete modifie." }

# --- Etape 3 : sauvegarde serveur + mise a jour ---------------------------------------------------
$remoteScript = @"
set -euo pipefail
cd $(ConvertTo-ShellQuoted $RemoteDir)

MISTRAL_KEY=$(ConvertTo-ShellQuoted $mistralKey)
GEMINI_KEY=$(ConvertTo-ShellQuoted $geminiKey)
MISTRAL_MODEL_VALUE=$(ConvertTo-ShellQuoted $MistralModel)
GEMINI_MODEL_VALUE=$(ConvertTo-ShellQuoted $GeminiModel)

ENV_FILE=.env.demo
[ -f "`$ENV_FILE" ] || { echo "ERREUR : `$ENV_FILE introuvable dans `$(pwd)"; exit 1; }

mkdir -p backups/env
BACKUP="backups/env/env.demo.`$(date +%Y%m%d-%H%M%S).avant-cles-ia.bak"
cp "`$ENV_FILE" "`$BACKUP"
chmod 600 "`$BACKUP"
echo "Sauvegarde serveur : `$(pwd)/`$BACKUP"

set_env() {
  local key="`$1" value="`$2" tmp
  tmp="`$(mktemp)"
  grep -v "^`${key}=" "`$ENV_FILE" > "`$tmp" || true
  printf '%s=%s\n' "`$key" "`$value" >> "`$tmp"
  cat "`$tmp" > "`$ENV_FILE"
  rm -f "`$tmp"
  echo "OK : `$key mis a jour"
}

set_env MISTRAL_API_KEY "`$MISTRAL_KEY"
set_env MISTRAL_MODEL   "`$MISTRAL_MODEL_VALUE"
set_env GEMINI_API_KEY  "`$GEMINI_KEY"
set_env GEMINI_MODEL    "`$GEMINI_MODEL_VALUE"
chmod 600 "`$ENV_FILE"

echo
grep -E '^(MISTRAL|GEMINI)_' "`$ENV_FILE" | sed -E 's/^([A-Z_]+_API_KEY=.{6}).*/\1...(masquee)/'
"@ -replace "`r`n", "`n"

Write-Step "Etape 3 : mise a jour de .env.demo sur $target"
# Windows PowerShell peut ajouter un BOM UTF-8 en tete et un CRLF a la fin : sed retire les deux,
# sinon "set -euo pipefail" serait ignore et la derniere commande recevrait un \r
$remoteScript | & ssh @sshArgs $target 'sed -e ''1s/^\xEF\xBB\xBF//'' -e ''s/\r$//'' | bash -s'
$code = $LASTEXITCODE
$mistralKey = $null; $geminiKey = $null; $remoteScript = $null
if ($code -ne 0) { Stop-Script "la mise a jour a echoue sur le serveur (code $code). Sauvegarde locale : $localBackup" }
Write-Host "Cles mises a jour." -ForegroundColor Green

# --- Etape 4 : prise en compte des cles -----------------------------------------------------------
Write-Step "Etape 4 : prise en compte des cles"
if (-not $Restart) {
    $answer = Read-Host "Le code du conseiller IA est-il DEJA deploye sur la demo ? Relancer le backend maintenant ? (o/n)"
    $Restart = $answer -match '^[oOyY]'
}
if ($Restart) {
    # up -d recree le conteneur backend pour qu'il relise .env.demo (un simple restart ne suffit pas)
    & ssh @sshArgs $target "cd $(ConvertTo-ShellQuoted $RemoteDir) && docker compose -f docker-compose.demo.yml --env-file .env.demo up -d backend"
    if ($LASTEXITCODE -ne 0) { Stop-Script "la relance du backend a echoue (code $LASTEXITCODE)." }
    Write-Host "Backend relance avec les nouvelles cles." -ForegroundColor Green
} else {
    Write-Host "Lancez maintenant le deploiement : .\scripts\deploy-demo.ps1 -Server $Server" -ForegroundColor Yellow
}

Write-Host "`nTermine. Sauvegarde locale : $localBackup" -ForegroundColor Green
Write-Host "Pour restaurer : scp `"$localBackup`" ${target}:$RemoteDir/.env.demo  puis relancer le backend."
