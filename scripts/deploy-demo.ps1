<#
.SYNOPSIS
    Deploie (ou met a jour) la demo "Tsena Pro" sur le VPS Contabo, par SSH, avec Docker.

.DESCRIPTION
    - Se connecte en SSH, clone/met a jour le depot dans /opt/tsena-pro, cree .env.demo au premier
      lancement (secrets aleatoires), construit la pile Docker `tsena-pro`, attend qu'elle reponde
      et charge les donnees de demonstration (premier deploiement uniquement).
    - N'utilise ni les ports 80/443 ni les conteneurs des autres sites du serveur (All : port 8081,
      projet all-demo) : seul le port -DemoPort (8082 par defaut) est utilise.
    - HTTPS sans domaine : un tunnel Cloudflare gratuit donne une adresse https://xxxx.trycloudflare.com
      (affichee a la fin, retrouvable avec -Action url). -NoTunnel pour le desactiver.
    - Le code deploye est celui de GitHub (branche -Branch) : poussez (git push) avant de deployer.

.EXAMPLE
    .\scripts\deploy-demo.ps1 -Server 203.0.113.10
.EXAMPLE
    .\scripts\deploy-demo.ps1 -Server 203.0.113.10 -KeyPath $HOME\.ssh\id_ed25519
.EXAMPLE
    .\scripts\deploy-demo.ps1 -Server 203.0.113.10 -Action status
#>
[CmdletBinding()]
param(
    # Adresse IP (ou nom DNS) du VPS Contabo
    [string]$Server,
    [string]$User = 'root',
    [int]$Port = 22,
    # Cle privee SSH (sinon : agent SSH / cle par defaut / mot de passe)
    [string]$KeyPath,
    # deploy = installer/mettre a jour ; status ; logs ; url (adresse HTTPS) ; seed (EFFACE les donnees) ; stop
    [ValidateSet('deploy', 'status', 'logs', 'seed', 'stop', 'url')]
    [string]$Action = 'deploy',
    [string]$Branch = 'main',
    [string]$RepoUrl = 'https://github.com/AbelMaminiaina/ecommerce3.git',
    [string]$RemoteDir = '/opt/tsena-pro',
    # Port public de la demo sur le serveur (ne doit pas etre utilise par un autre site ; 8081 = All)
    [int]$DemoPort = 8082,
    # Sans HTTPS : ne pas demarrer le tunnel Cloudflare (acces http://IP:port uniquement)
    [switch]$NoTunnel,
    # Ne pas demander de confirmation
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Stop-Deploy([string]$Message) { Write-Host "`nERREUR : $Message" -ForegroundColor Red; exit 1 }

# --- Prerequis locaux ---------------------------------------------------------------------------
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Stop-Deploy "Le client SSH est introuvable. Activez 'Client OpenSSH' (Parametres > Applications > Fonctionnalites facultatives)."
}
$remoteScriptPath = Join-Path $PSScriptRoot 'remote-deploy.sh'
if (-not (Test-Path $remoteScriptPath)) { Stop-Deploy "Fichier introuvable : $remoteScriptPath" }

if (-not $Server) { $Server = Read-Host "Adresse IP (ou nom) du serveur Contabo" }
if (-not $Server) { Stop-Deploy "Adresse du serveur requise (-Server)." }
if ($Server -notmatch '^[A-Za-z0-9._-]+$') { Stop-Deploy "Adresse de serveur invalide : $Server" }
if ($RemoteDir -notmatch '^/[A-Za-z0-9._/-]+$') { Stop-Deploy "RemoteDir invalide : $RemoteDir" }
if ($Branch -notmatch '^[A-Za-z0-9._/-]+$') { Stop-Deploy "Nom de branche invalide : $Branch" }

$target = "$User@$Server"
$sshArgs = @('-p', $Port, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30')
if ($KeyPath) {
    if (-not (Test-Path $KeyPath)) { Stop-Deploy "Cle SSH introuvable : $KeyPath" }
    $sshArgs += @('-i', $KeyPath)
}

# Quote une valeur pour un shell distant (apostrophes echappees)
function ConvertTo-ShellQuoted([string]$Value) { "'" + ($Value -replace "'", "'\''") + "'" }

# Executes une commande distante ; le script est envoye sur l'entree standard s'il est fourni
function Invoke-Remote([string]$Command, [string]$Stdin) {
    if ($PSBoundParameters.ContainsKey('Stdin')) {
        $Stdin | & ssh @sshArgs $target $Command
    }
    else {
        & ssh @sshArgs $target $Command
    }
    $script:RemoteExit = $LASTEXITCODE
}

# Le script distant, avec fins de ligne Unix
$remoteScript = ((Get-Content -Raw -Path $remoteScriptPath) -replace "`r`n", "`n")

# --- Verifications sur le depot local (le serveur deploie ce qui est sur GitHub) ------------------
if ($Action -eq 'deploy') {
    try {
        $repoRoot = Split-Path $PSScriptRoot -Parent
        if (Get-Command git -ErrorAction SilentlyContinue) {
            $dirty = git -C $repoRoot status --porcelain 2>$null
            $localHead = (git -C $repoRoot rev-parse HEAD 2>$null)
            $remoteLine = (git -C $repoRoot ls-remote origin $Branch 2>$null)
            $remoteHead = if ($remoteLine) { ($remoteLine -split '\s+')[0] } else { $null }
            if ($dirty) {
                Write-Host "Attention : des modifications locales ne sont pas commitees. Le serveur deploiera la version GitHub, sans elles." -ForegroundColor Yellow
            }
            if ($localHead -and $remoteHead -and $localHead -ne $remoteHead) {
                Write-Host "Attention : votre commit local ($($localHead.Substring(0,7))) n'est pas celui de origin/$Branch ($($remoteHead.Substring(0,7))). Faites 'git push' pour deployer votre derniere version." -ForegroundColor Yellow
            }
        }
    }
    catch { }
}

# --- Actions simples ----------------------------------------------------------------------------
$envPrefix = @(
    "APP_DIR=$(ConvertTo-ShellQuoted $RemoteDir)",
    "REPO_URL=$(ConvertTo-ShellQuoted $RepoUrl)",
    "BRANCH=$(ConvertTo-ShellQuoted $Branch)",
    "DEMO_PORT=$DemoPort",
    "SERVER_HOST=$(ConvertTo-ShellQuoted $Server)",
    "TUNNEL=$(if ($NoTunnel) { 0 } else { 1 })"
)

if ($Action -eq 'seed') {
    Write-Host "Le chargement des donnees de demonstration EFFACE produits, commandes et comptes du serveur." -ForegroundColor Yellow
    if ((Read-Host "Tapez EFFACER pour continuer") -ne 'EFFACER') { Stop-Deploy "Annule." }
}

if ($Action -ne 'deploy') {
    Write-Step "$Action sur $target"
    Invoke-Remote ("env " + ($envPrefix -join ' ') + " bash -s -- $Action") $remoteScript
    exit $script:RemoteExit
}

# --- Deploiement --------------------------------------------------------------------------------
Write-Step "Connexion a $target (port SSH $Port)"
$check = & ssh @sshArgs $target "test -f $RemoteDir/.env.demo && echo EXISTS || echo NEW"
if ($LASTEXITCODE -ne 0) {
    Stop-Deploy "Connexion SSH impossible. Verifiez l'adresse, le port, l'utilisateur et la cle (-KeyPath)."
}
$isNew = ($check -join '').Trim() -eq 'NEW'

if ($isNew) {
    Write-Host "Premier deploiement : la configuration va etre creee avec des secrets generes automatiquement."
    Write-Host "Numeros Mobile Money marchands (Entree = ne pas proposer cet operateur pour l'instant) :"
    $mvola = Read-Host "  MVola"
    $orange = Read-Host "  Orange Money"
    $airtel = Read-Host "  Airtel Money"
    $adminEmail = Read-Host "E-mail du compte administrateur [admin@example.com]"
    if (-not $adminEmail) { $adminEmail = 'admin@example.com' }
    foreach ($v in @($mvola, $orange, $airtel)) {
        if ($v -and $v -notmatch '^[0-9 +().-]{6,30}$') { Stop-Deploy "Numero invalide : $v" }
    }
    if ($adminEmail -notmatch '^[^\s@''"$`\\]+@[^\s@''"$`\\]+\.[^\s@''"$`\\]+$') { Stop-Deploy "E-mail invalide : $adminEmail" }
    $envPrefix += @(
        "MVOLA=$(ConvertTo-ShellQuoted $mvola)",
        "ORANGE=$(ConvertTo-ShellQuoted $orange)",
        "AIRTEL=$(ConvertTo-ShellQuoted $airtel)",
        "ADMIN_EMAIL=$(ConvertTo-ShellQuoted $adminEmail)"
    )
}
else {
    Write-Host "Une installation existe deja : mise a jour du code et reconstruction (donnees conservees)."
}

if (-not $Yes) {
    Write-Host ""
    Write-Host "  Serveur     : $target"
    Write-Host "  Dossier     : $RemoteDir"
    Write-Host "  Depot       : $RepoUrl ($Branch)"
    Write-Host "  Acces       : http://${Server}:$DemoPort$(if (-not $NoTunnel) { "  + HTTPS via tunnel Cloudflare" })"
    Write-Host "  Les autres sites du serveur (ports 80/443) ne sont pas modifies."
    if ((Read-Host "Lancer le deploiement ? (o/N)") -notmatch '^[oOyY]') { Stop-Deploy "Annule." }
}

Write-Step "Deploiement en cours (le premier build dure plusieurs minutes)"
Invoke-Remote ("env " + ($envPrefix -join ' ') + " bash -s -- deploy") $remoteScript
if ($script:RemoteExit -ne 0) { Stop-Deploy "Le deploiement a echoue (code $($script:RemoteExit)). Voir les messages ci-dessus." }

Write-Host "`nTermine. Commandes utiles :" -ForegroundColor Green
Write-Host "  .\scripts\deploy-demo.ps1 -Server $Server -Action status"
Write-Host "  .\scripts\deploy-demo.ps1 -Server $Server -Action logs"
Write-Host "  .\scripts\deploy-demo.ps1 -Server $Server -Action url       (retrouver l'adresse HTTPS)"
Write-Host "  .\scripts\deploy-demo.ps1 -Server $Server            (mise a jour apres un git push)"
