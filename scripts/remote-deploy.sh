#!/usr/bin/env bash
# Execute SUR LE SERVEUR par scripts/deploy-demo.ps1 (envoye par SSH sur l'entree standard).
# Deploiement de la demo "Tsena Pro" : projet Docker dedie (tsena-pro), port dedie, aucun impact sur les
# autres sites du serveur (All : projet all-demo, port 8081). Fichier volontairement ASCII (transite par stdin depuis PowerShell).
#
# Usage : bash -s -- <deploy|status|logs|seed|stop|url>
# Variables d'environnement lues : APP_DIR REPO_URL BRANCH DEMO_PORT SERVER_HOST TUNNEL
#   (creation de .env.demo au premier deploiement) : MVOLA ORANGE AIRTEL ADMIN_EMAIL
# TUNNEL=1 (defaut) : HTTPS via Cloudflare Tunnel (adresse https://xxxx.trycloudflare.com, sans domaine)
set -euo pipefail

ACTION="${1:-deploy}"
TUNNEL="${TUNNEL:-1}"
APP_DIR="${APP_DIR:-/opt/tsena-pro}"
REPO_URL="${REPO_URL:-https://github.com/AbelMaminiaina/ecommerce3.git}"
BRANCH="${BRANCH:-main}"
DEMO_PORT="${DEMO_PORT:-8082}"
SERVER_HOST="${SERVER_HOST:-}"
PROJECT="tsena-pro"

say()  { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERREUR: %s\n' "$*" >&2; exit 1; }

compose() {
  # Le profil "tunnel" active le service cloudflared (HTTPS sans domaine)
  local profile=()
  if [ "$TUNNEL" = "1" ]; then profile=(--profile tunnel); fi
  docker compose -f docker-compose.demo.yml --env-file .env.demo ${profile[@]+"${profile[@]}"} "$@"
}

# Adresse HTTPS courante du tunnel Cloudflare (lue dans les logs du conteneur)
tunnel_url() {
  compose logs --no-color tunnel 2>/dev/null \
    | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true
}

wait_tunnel() {
  [ "$TUNNEL" = "1" ] || return 0
  say "Attente de l'adresse HTTPS (tunnel Cloudflare)"
  local i url
  for i in $(seq 1 45); do
    url="$(tunnel_url)"
    if [ -n "$url" ]; then
      # Le nom DNS met quelques secondes a etre propage
      for _ in $(seq 1 20); do
        if curl -fsS -o /dev/null -m 8 "$url/api/payments/methods" 2>/dev/null; then
          echo "Tunnel HTTPS pret : $url"
          return 0
        fi
        sleep 3
      done
      echo "Adresse obtenue ($url) mais pas encore joignable : reessayez dans une minute."
      return 0
    fi
    sleep 2
  done
  echo "ATTENTION : adresse HTTPS non obtenue (le serveur joint-il internet ?). Logs du tunnel :"
  compose logs --tail 20 tunnel || true
  return 0
}

# Mot de passe aleatoire alphanumerique (pas de caractere special : safe pour .env et docker)
gen() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1" || true; }

check_prereqs() {
  say "Verification du serveur"
  command -v docker >/dev/null 2>&1 || fail "Docker n'est pas installe sur ce serveur."
  docker compose version >/dev/null 2>&1 || fail "Le plugin 'docker compose' est absent."
  command -v git >/dev/null 2>&1 || fail "git n'est pas installe (apt install git)."
  command -v curl >/dev/null 2>&1 || fail "curl n'est pas installe (apt install curl)."
  docker info >/dev/null 2>&1 || fail "Le daemon Docker n'est pas joignable (droits ? utilisez root ou le groupe docker)."
}

port_in_use() {
  command -v ss >/dev/null 2>&1 || return 1
  ss -tln 2>/dev/null | awk 'NR>1 {print $4}' | grep -qE "[:.]${DEMO_PORT}\$"
}

our_stack_running() {
  [ -n "$(docker ps -q --filter "label=com.docker.compose.project=${PROJECT}" 2>/dev/null)" ]
}

fetch_code() {
  if [ -d "$APP_DIR/.git" ]; then
    say "Mise a jour du code ($BRANCH)"
    git -C "$APP_DIR" fetch --quiet origin
    git -C "$APP_DIR" checkout --quiet "$BRANCH"
    git -C "$APP_DIR" pull --ff-only --quiet origin "$BRANCH" \
      || fail "git pull impossible (modifications locales sur le serveur ?). Voir: git -C $APP_DIR status"
  else
    say "Clonage de $REPO_URL dans $APP_DIR"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR" \
      || fail "Clonage impossible. Depot prive ? Configurez un acces (token GitHub ou cle de deploiement SSH)."
  fi
  echo "Version deployee: $(git -C "$APP_DIR" log -1 --format='%h %s')"
}

create_env() {
  [ -n "$SERVER_HOST" ] || fail "SERVER_HOST manquant (adresse IP ou domaine du serveur)."
  say "Creation de .env.demo (secrets generes)"
  ADMIN_PASSWORD="$(gen 20)"
  cat > .env.demo <<EOF
PUBLIC_URL=http://${SERVER_HOST}:${DEMO_PORT}
DEMO_PORT=${DEMO_PORT}
POSTGRES_PASSWORD=$(gen 32)
REDIS_PASSWORD=$(gen 32)
JWT_SECRET=$(gen 48)
NEXTAUTH_SECRET=$(gen 48)
PLATFORM_ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}
PLATFORM_ADMIN_PASSWORD=${ADMIN_PASSWORD}
PAYMENT_MVOLA_NUMBER=${MVOLA:-}
PAYMENT_ORANGE_MONEY_NUMBER=${ORANGE:-}
PAYMENT_AIRTEL_MONEY_NUMBER=${AIRTEL:-}
PAYMENT_ACCOUNT_NAME="Tsena Pro"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
ADMIN_EMAIL=
EOF
  chmod 600 .env.demo
  NEW_ENV=1
  NEW_ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
  NEW_ADMIN_PASSWORD="$ADMIN_PASSWORD"
}

open_firewall() {
  if command -v ufw >/dev/null 2>&1 && [ "$(id -u)" = "0" ] && ufw status 2>/dev/null | grep -q "Status: active"; then
    say "Pare-feu ufw : ouverture du port ${DEMO_PORT}/tcp"
    ufw allow "${DEMO_PORT}/tcp" >/dev/null
  fi
}

wait_ready() {
  say "Attente du demarrage de l'application (peut prendre 1 a 2 minutes)"
  local i
  for i in $(seq 1 90); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${DEMO_PORT}/api/payments/methods" 2>/dev/null \
       && curl -fsS -o /dev/null "http://127.0.0.1:${DEMO_PORT}/" 2>/dev/null; then
      echo "Application prete."
      return 0
    fi
    sleep 2
  done
  compose ps || true
  compose logs --tail 40 backend frontend || true
  fail "L'application ne repond pas apres 3 minutes (logs ci-dessus)."
}

run_seed() {
  say "Chargement des donnees de demonstration (efface l'existant)"
  compose exec -T backend npx tsx prisma/seed.ts
  # Le catalogue vide a pu etre mis en cache (5 min) pendant l'attente du demarrage, avant le seed :
  # on vide le Redis de cette pile (dedie a Tsena Pro) pour que le catalogue apparaisse tout de suite.
  local redis_password
  redis_password="$(grep '^REDIS_PASSWORD=' .env.demo | cut -d= -f2-)"
  compose exec -T redis redis-cli --no-auth-warning -a "$redis_password" FLUSHALL >/dev/null
}

do_deploy() {
  check_prereqs
  NEW_ENV=0
  if [ ! -f "$APP_DIR/.env.demo" ] && port_in_use && ! our_stack_running; then
    fail "Le port ${DEMO_PORT} est deja utilise par autre chose sur ce serveur. Relancez avec -DemoPort <autre port>."
  fi
  fetch_code
  cd "$APP_DIR"
  [ -f docker-compose.demo.yml ] || fail "docker-compose.demo.yml introuvable : la branche '$BRANCH' ne contient pas la config de demo."
  if [ ! -f .env.demo ]; then create_env; fi
  open_firewall

  say "Construction et demarrage des conteneurs (le premier build dure plusieurs minutes)"
  compose up -d --build
  # La config nginx est montee depuis le depot : la recharger (sans coupure) apres une mise a jour
  compose exec -T nginx nginx -s reload >/dev/null 2>&1 || compose restart nginx >/dev/null 2>&1 || true

  wait_ready
  if [ "$NEW_ENV" = "1" ]; then run_seed; fi
  wait_tunnel

  say "Etat des conteneurs"
  compose ps

  local url
  url="$(grep '^PUBLIC_URL=' .env.demo | cut -d= -f2-)"
  echo
  echo "================================================================"
  echo " DEPLOIEMENT TERMINE"
  if [ "$TUNNEL" = "1" ] && [ -n "$(tunnel_url)" ]; then
    echo " Site (HTTPS) : $(tunnel_url)      <-- a utiliser (iPhone, partage)"
    echo " Admin        : $(tunnel_url)/admin/login"
    echo " Site (HTTP)  : ${url}"
    echo " NB : l'adresse HTTPS change si le conteneur du tunnel est recree ; retrouvez-la avec -Action url"
  else
    echo " Site         : ${url}"
    echo " Admin        : ${url}/admin/login"
  fi
  if [ "$NEW_ENV" = "1" ]; then
    echo " Compte admin : ${NEW_ADMIN_EMAIL}"
    echo " Mot de passe : ${NEW_ADMIN_PASSWORD}   <-- NOTEZ-LE, il n'est affiche qu'une fois"
    echo "                (conserve aussi dans ${APP_DIR}/.env.demo)"
  fi
  echo " Acheteur demo: buyer@grossiste-demo.example / demo1234"
  echo "================================================================"
  echo "Si le site est injoignable depuis l'exterieur, ouvrez le port ${DEMO_PORT}/tcp dans le pare-feu"
  echo "du panneau Contabo (en plus d'ufw)."
}

need_env() {
  [ -f "$APP_DIR/.env.demo" ] || fail "Rien n'est deploye dans $APP_DIR (lancez d'abord un deploiement)."
  cd "$APP_DIR"
}

case "$ACTION" in
  deploy) do_deploy ;;
  status) need_env; compose ps ;;
  logs)   need_env; compose logs --tail 100 ;;
  seed)   need_env; run_seed ;;
  stop)   need_env; compose down; echo "Arrete (donnees conservees dans les volumes Docker)." ;;
  url)
    need_env
    echo "HTTP  : $(grep '^PUBLIC_URL=' .env.demo | cut -d= -f2-)"
    t="$(tunnel_url)"
    if [ -n "$t" ]; then echo "HTTPS : $t"; else echo "HTTPS : aucun tunnel actif (deploiement sans tunnel ?)"; fi
    ;;
  *)      fail "Action inconnue: $ACTION" ;;
esac
exit 0
