<#
.SYNOPSIS
    Mise en production complete de la demo Tsena Pro : verifications, tests, sauvegarde, reglages, deploiement, controles.

.DESCRIPTION
    Enchaine, en s'arretant a la premiere erreur :
      1. Verifie que le depot local est propre et pousse sur GitHub (le serveur deploie la version GitHub).
      2. Lance les tests : backend, site, paquet partage, typage et lint de l'application (-SkipTests pour passer).
      3. Sauvegarde la base et les photos du serveur AVANT les migrations (scripts/backup-demo.sh sur le VPS).
      4. Applique les reglages demandes dans .env.demo (SMS, paiement a la livraison, paiement garanti),
         avec une copie de securite du fichier ; seuls les parametres fournis sont modifies.
      5. Deploie avec scripts/deploy-demo.ps1 (les migrations de la base s'appliquent au demarrage du backend).
      6. Controle le resultat : sante de l'API, migrations appliquees, zones de livraison, connexion par SMS.
      7. Facultatif (-MobileBuild) : compile l'APK Android de l'application (EAS, profil "preview").
    Les cles du conseiller IA se reglent a part : .\scripts\set-ai-keys.ps1

.EXAMPLE
    .\scripts\deploy-release.ps1
.EXAMPLE
    .\scripts\deploy-release.ps1 -SmsProvider demo -CashOnDelivery on -CashOnDeliveryMaxAmount 5000000
.EXAMPLE
    .\scripts\deploy-release.ps1 -SkipTests -MobileBuild
#>
[CmdletBinding()]
param(
    [string]$Server = '167.86.111.192',
    [string]$User = 'root',
    [int]$Port = 22,
    [string]$KeyPath,
    [string]$RemoteDir = '/opt/tsena-pro',
    [string]$Branch = 'main',
    [int]$DemoPort = 8082,
    # Ne pas lancer les tests locaux (deja passes)
    [switch]$SkipTests,
    # Envoi des SMS : demo (code affiche a l'ecran, aucun SMS), orange, twilio ; vide = inchange
    [ValidateSet('', 'demo', 'orange', 'twilio')]
    [string]$SmsProvider = '',
    # Paiement a la livraison : on / off ; vide = inchange
    [ValidateSet('', 'on', 'off')]
    [string]$CashOnDelivery = '',
    # Plafond des articles payables a la livraison, en Ariary (0 = inchange)
    [int]$CashOnDeliveryMaxAmount = 0,
    # Jours laisses a l'acheteur pour signaler un probleme (-1 = inchange, 0 = reception confirmee a la livraison)
    [int]$BuyerProtectionDays = -1,
    # Compiler aussi l'APK Android (compte Expo requis, compilation dans le cloud)
    [switch]$MobileBuild,
    # Ne pas demander de confirmation
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Stop-Release([string]$Message) { Write-Host "`nERREUR : $Message" -ForegroundColor Red; exit 1 }
function ConvertTo-ShellQuoted([string]$Value) { "'" + ($Value -replace "'", "'\''") + "'" }

# Lance une commande dans un dossier du depot ; arrete tout si elle echoue
function Invoke-Checked([string]$Label, [string]$Directory, [scriptblock]$Command) {
    Write-Host "  - $Label" -NoNewline
    Push-Location (Join-Path $repoRoot $Directory)
    # PowerShell 5.1 : avec 2>&1, une ligne sur stderr deviendrait une erreur fatale sous 'Stop' ; seul le code compte
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Command 2>&1
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
        Pop-Location
    }
    if ($code -ne 0) {
        Write-Host " : ECHEC" -ForegroundColor Red
        $output | Select-Object -Last 30 | ForEach-Object { Write-Host "    $_" }
        Stop-Release "$Label a echoue : rien n'a ete deploye."
    }
    Write-Host " : OK" -ForegroundColor Green
}

foreach ($tool in @('ssh', 'git', 'npx')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Stop-Release "$tool introuvable." }
}
if ($KeyPath -and -not (Test-Path $KeyPath)) { Stop-Release "Cle SSH introuvable : $KeyPath" }

$target = "$User@$Server"
$sshArgs = @('-p', $Port, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30')
if ($KeyPath) { $sshArgs += @('-i', $KeyPath) }

# Script distant envoye sur l'entree standard (BOM et CRLF de Windows PowerShell retires cote serveur).
# Sa sortie va a l'ecran (Out-Host) : la fonction ne renvoie que le code de retour.
function Invoke-RemoteScript([string]$Script) {
    ($Script -replace "`r`n", "`n") | & ssh @sshArgs $target 'sed -e ''1s/^\xEF\xBB\xBF//'' -e ''s/\r$//'' | bash -s' | Out-Host
    return $LASTEXITCODE
}

# --- 1. Depot ---------------------------------------------------------------------------------------
Write-Step "1/7 Depot local (le serveur deploie la branche $Branch de GitHub)"
$dirty = git -C $repoRoot status --porcelain
if ($dirty) {
    $dirty | Select-Object -First 15 | ForEach-Object { Write-Host "    $_" }
    Stop-Release "des modifications ne sont pas commitees : committez et poussez-les avant de deployer."
}
git -C $repoRoot fetch -q origin $Branch
$localHead = git -C $repoRoot rev-parse HEAD
$remoteHead = git -C $repoRoot rev-parse "origin/$Branch"
if ($localHead -ne $remoteHead) {
    Stop-Release "le commit local ($($localHead.Substring(0,7))) n'est pas celui de origin/$Branch ($($remoteHead.Substring(0,7))) : faites 'git push'."
}
Write-Host "  Version deployee : $($localHead.Substring(0,7)) $(git -C $repoRoot log -1 --format=%s)" -ForegroundColor Green

# --- 2. Tests -----------------------------------------------------------------------------------------
Write-Step "2/7 Tests"
if ($SkipTests) {
    Write-Host "  Tests ignores (-SkipTests)." -ForegroundColor Yellow
}
else {
    Invoke-Checked 'Backend (tests)' 'backend' { npx vitest run }
    Invoke-Checked 'Backend (typage)' 'backend' { npx tsc --noEmit -p . }
    Invoke-Checked 'Site (tests)' 'frontend' { npx vitest run }
    Invoke-Checked 'Site (typage)' 'frontend' { npx tsc --noEmit -p . }
    Invoke-Checked 'Paquet partage (tests)' 'packages/shared' { npx vitest run }
    Invoke-Checked 'Application (typage)' 'mobile' { npx tsc --noEmit }
    Invoke-Checked 'Application (lint)' 'mobile' { npx expo lint }
}

# --- Recapitulatif et confirmation ------------------------------------------------------------------
$settings = [ordered]@{}
if ($SmsProvider) { $settings['SMS_PROVIDER'] = $SmsProvider }
if ($CashOnDelivery) { $settings['CASH_ON_DELIVERY'] = $(if ($CashOnDelivery -eq 'on') { 'true' } else { 'false' }) }
if ($CashOnDeliveryMaxAmount -gt 0) { $settings['CASH_ON_DELIVERY_MAX_AMOUNT'] = "$CashOnDeliveryMaxAmount" }
if ($BuyerProtectionDays -ge 0) { $settings['BUYER_PROTECTION_DAYS'] = "$BuyerProtectionDays" }

if (-not $Yes) {
    Write-Host ""
    Write-Host "  Serveur   : $target ($RemoteDir, port $DemoPort)"
    Write-Host "  Version   : $($localHead.Substring(0,7))"
    Write-Host "  Reglages  : $(if ($settings.Count) { ($settings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', ' } else { 'inchanges' })"
    Write-Host "  Mobile    : $(if ($MobileBuild) { 'compilation de l''APK Android' } else { 'non' })"
    Write-Host "  La base du serveur est sauvegardee avant les migrations."
    if ((Read-Host "Lancer la mise en production ? (o/N)") -notmatch '^[oOyY]') { Stop-Release "Annule." }
}

# --- 3. Sauvegarde du serveur -------------------------------------------------------------------------
Write-Step "3/7 Sauvegarde de la base et des photos du serveur"
$backupScript = @"
set -euo pipefail
cd $(ConvertTo-ShellQuoted $RemoteDir)
if [ ! -f .env.demo ]; then echo "Premiere installation : rien a sauvegarder"; exit 0; fi
if [ -f scripts/backup-demo.sh ]; then
  bash scripts/backup-demo.sh
else
  # Ancienne copie du depot sans le script : export direct de la base
  mkdir -p backups && umask 077
  docker compose -f docker-compose.demo.yml --env-file .env.demo exec -T postgres pg_dump -U tsenapro -d tsenapro --no-owner --clean --if-exists | gzip -9 > "backups/db-`$(date +%Y%m%d-%H%M)-avant-release.sql.gz"
fi
echo "Sauvegardes recentes :"
ls -1t backups/db-*.sql.gz 2>/dev/null | head -3
"@
if ((Invoke-RemoteScript $backupScript) -ne 0) { Stop-Release "la sauvegarde a echoue : rien n'a ete deploye." }

# --- 4. Reglages ------------------------------------------------------------------------------------
Write-Step "4/7 Reglages du serveur (.env.demo)"
if ($settings.Count -eq 0) {
    Write-Host "  Aucun reglage demande : .env.demo inchange."
}
else {
    $lines = ($settings.GetEnumerator() | ForEach-Object { "set_env $($_.Key) $(ConvertTo-ShellQuoted $_.Value)" }) -join "`n"
    $envScript = @"
set -euo pipefail
cd $(ConvertTo-ShellQuoted $RemoteDir)
ENV_FILE=.env.demo
if [ ! -f "`$ENV_FILE" ]; then echo "Premiere installation : reglages appliques apres creation, relancez ce script"; exit 0; fi
mkdir -p backups/env
cp "`$ENV_FILE" "backups/env/env.demo.`$(date +%Y%m%d-%H%M%S).avant-release.bak"
set_env() {
  local key="`$1" value="`$2" tmp
  tmp="`$(mktemp)"
  grep -v "^`${key}=" "`$ENV_FILE" > "`$tmp" || true
  printf '%s=%s\n' "`$key" "`$value" >> "`$tmp"
  cat "`$tmp" > "`$ENV_FILE"; rm -f "`$tmp"
  echo "OK : `$key=`$value"
}
$lines
chmod 600 "`$ENV_FILE"
"@
    if ((Invoke-RemoteScript $envScript) -ne 0) { Stop-Release "la mise a jour de .env.demo a echoue." }
    if ($SmsProvider -eq 'demo') {
        Write-Host "  SMS en mode demo : le code de connexion s'affiche a l'ecran (demonstration uniquement)." -ForegroundColor Yellow
    }
}

# --- 5. Deploiement -----------------------------------------------------------------------------------
Write-Step "5/7 Deploiement (build Docker, migrations de la base au demarrage du backend)"
$deployArgs = @{ Server = $Server; User = $User; Port = $Port; Branch = $Branch; RemoteDir = $RemoteDir; DemoPort = $DemoPort; Yes = $true }
if ($KeyPath) { $deployArgs['KeyPath'] = $KeyPath }
& (Join-Path $PSScriptRoot 'deploy-demo.ps1') @deployArgs
if ($LASTEXITCODE -ne 0) { Stop-Release "le deploiement a echoue. La sauvegarde de l'etape 3 permet de revenir en arriere." }

# --- 6. Controles -------------------------------------------------------------------------------------
Write-Step "6/7 Controles apres deploiement"
$checkScript = @"
set -uo pipefail
cd $(ConvertTo-ShellQuoted $RemoteDir)
api="http://127.0.0.1:$DemoPort/api"
fail=0
check() { if [ "`$2" = "1" ]; then echo "  OK    `$1"; else echo "  ECHEC `$1"; fail=1; fi; }
health=""
for i in `$(seq 1 30); do health="`$(curl -s -m 5 "`$api/health" || true)"; echo "`$health" | grep -q '"status":"ok"' && break; sleep 2; done
check "API en ligne" "`$(echo "`$health" | grep -q '"status":"ok"' && echo 1)"
check "Redis connecte" "`$(echo "`$health" | grep -q '"redis":"connected"' && echo 1)"
migrations="`$(docker compose -f docker-compose.demo.yml --env-file .env.demo exec -T backend npx prisma migrate status 2>&1 || true)"
check "Migrations de la base appliquees" "`$(echo "`$migrations" | grep -q 'Database schema is up to date' && echo 1)"
zones="`$(curl -s -m 5 "`$api/shipping/options" | grep -o '"isDefault"' | wc -l)"
check "Zones de livraison (`$zones)" "`$([ "`$zones" -ge 1 ] && echo 1)"
phone="`$(curl -s -m 5 "`$api/auth/phone")"
echo "  INFO  Connexion par SMS : `$phone"
methods="`$(curl -s -m 5 "`$api/payments/methods" | grep -o '"id":"[a-z_]*"' | tr '\n' ' ')"
echo "  INFO  Moyens de paiement : `$methods"
site="`$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$DemoPort/")"
check "Site (accueil, code `$site)" "`$([ "`$site" = "200" ] && echo 1)"
exit `$fail
"@
$checksFailed = (Invoke-RemoteScript $checkScript) -ne 0
if ($checksFailed) {
    Write-Host "`nCertains controles ont echoue : voir les journaux avec .\scripts\deploy-demo.ps1 -Server $Server -Action logs" -ForegroundColor Yellow
}

# --- 7. Application mobile ----------------------------------------------------------------------------
Write-Step "7/7 Application mobile"
if ($MobileBuild) {
    # expo-updates n'est pas installe : pas de mise a jour a distance, il faut une nouvelle compilation.
    # Profil "preview" : APK installable directement, API de la demo (eas.json).
    Push-Location (Join-Path $repoRoot 'mobile')
    try { npx eas-cli@latest build --profile preview --platform android --non-interactive }
    finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Write-Host "La compilation de l'APK a echoue (compte Expo : npx eas-cli@latest login)." -ForegroundColor Yellow }
}
else {
    Write-Host "  Non demandee. Pour livrer l'application : .\scripts\deploy-release.ps1 -SkipTests -MobileBuild"
}

Write-Host "`nMise en production terminee$(if ($checksFailed) { ' AVEC DES CONTROLES EN ECHEC' })." -ForegroundColor $(if ($checksFailed) { 'Yellow' } else { 'Green' })
Write-Host "  Adresse HTTPS : .\scripts\deploy-demo.ps1 -Server $Server -Action url"
Write-Host "  Cles de l'IA  : .\scripts\set-ai-keys.ps1 -Restart"
if ($checksFailed) { exit 1 }
