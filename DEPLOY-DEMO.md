# Déploiement de Tsena Pro sur le VPS Contabo (Docker, sans domaine)

Tsena Pro tourne **à côté des autres sites du serveur** (All, Ferme du Vardier…) sans les perturber :
projet Docker dédié, port dédié, aucun usage des ports 80/443, Postgres et Redis non exposés.
Deux adresses sont disponibles, **sans nom de domaine** :

| Accès | Adresse | Usage |
|---|---|---|
| **IP** | `http://IP_DU_VPS:8082` | Accès direct, HTTP (non chiffré) |
| **Cloudflare** | `https://xxxx.trycloudflare.com` | HTTPS gratuit (iPhone, partage du lien) ; l'adresse change si le conteneur du tunnel est recréé |

| Élément | Tsena Pro | (pour mémoire) All |
|---|---|---|
| Dossier sur le serveur | `/opt/tsena-pro` | `/opt/all` |
| Dépôt | `github.com/AbelMaminiaina/ecommerce3` | `github.com/AbelMaminiaina/econEW` |
| Projet Docker | `tsena-pro` (conteneurs et volumes `tsena-pro-…`) | `all-demo` |
| Port | **8082** | 8081 |
| Compose / nginx | `docker-compose.demo.yml` / `nginx/tsena-pro.conf` | — |
| Variables | `.env.demo` sur le serveur (modèle : `.env.demo.example`, jamais commité) | — |

Les deux piles sont indépendantes : déployer, arrêter ou supprimer Tsena Pro ne touche pas All.

## 1. Avant de déployer : pousser le code

Le serveur déploie **ce qui est sur GitHub** (branche `main` par défaut) :

```bash
git add -A && git commit -m "…" && git push origin main
```

## 2. Déployer en une commande (depuis Windows)

```powershell
.\scripts\deploy-demo.ps1 -Server IP_DU_VPS
# avec une clé SSH : -KeyPath $HOME\.ssh\id_ed25519     autre port : -DemoPort 8083     sans HTTPS : -NoTunnel
```

Au **premier** déploiement, le script :
1. vérifie Docker, git et curl sur le serveur, et que le port 8082 est libre ;
2. clone le dépôt dans `/opt/tsena-pro` ;
3. demande les numéros Mobile Money marchands et l'e-mail admin, puis crée `.env.demo` avec des
   **secrets générés automatiquement** ;
4. construit et démarre les conteneurs (plusieurs minutes la première fois), ouvre le port dans `ufw` ;
5. charge le catalogue de démonstration ;
6. démarre le tunnel Cloudflare et affiche **les deux liens** (IP et HTTPS) ainsi que le **mot de passe
   admin** (affiché une seule fois ; il reste dans `/opt/tsena-pro/.env.demo`).

Les déploiements suivants mettent seulement le code à jour et reconstruisent : **données, photos et
secrets sont conservés**.

> Si le site est injoignable depuis l'extérieur : ouvrez aussi le port **8082/tcp** dans le pare-feu du
> panneau Contabo (en plus d'`ufw`).

## 3. Commandes utiles

```powershell
.\scripts\deploy-demo.ps1 -Server IP_DU_VPS -Action url      # retrouver les liens IP et HTTPS
.\scripts\deploy-demo.ps1 -Server IP_DU_VPS -Action status   # état des conteneurs
.\scripts\deploy-demo.ps1 -Server IP_DU_VPS -Action logs     # derniers logs
.\scripts\deploy-demo.ps1 -Server IP_DU_VPS -Action stop     # arrêter (données conservées)
.\scripts\deploy-demo.ps1 -Server IP_DU_VPS -Action seed     # ⚠️ EFFACE tout et recharge la démo
```

## 4. Déploiement manuel (sur le serveur, sans le script)

```bash
ssh root@IP_DU_VPS
ss -tlnp | grep 8082                  # doit être vide (sinon choisir un autre DEMO_PORT)
git clone https://github.com/AbelMaminiaina/ecommerce3.git /opt/tsena-pro
cd /opt/tsena-pro
cp .env.demo.example .env.demo        # UNE seule fois : le relancer écraserait vos secrets
nano .env.demo                        # PUBLIC_URL=http://IP_DU_VPS:8082, mots de passe, secrets (openssl rand -base64 32)

C="docker compose -f docker-compose.demo.yml --env-file .env.demo --profile tunnel"
$C up -d --build
$C exec backend npx tsx prisma/seed.ts          # catalogue de démo (une seule fois : efface l'existant)
$C logs tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1   # lien HTTPS
```

Sans le profil `tunnel`, seul l'accès par IP est actif.

## 5. Exploitation

```bash
cd /opt/tsena-pro
C="docker compose -f docker-compose.demo.yml --env-file .env.demo --profile tunnel"
$C logs -f backend                    # logs (idem : frontend, nginx, tunnel)
$C restart backend                    # redémarrer un service
git pull && $C up -d --build          # mettre à jour

# Sauvegarde : base de données ET photos des produits (fichiers, absentes de la base)
$C exec -T postgres pg_dump -U tsenapro tsenapro > backup_tsenapro_$(date +%Y%m%d).sql
$C exec -T backend tar czf - -C /app/uploads . > backup_tsenapro_uploads_$(date +%Y%m%d).tar.gz
```

`$C down -v` supprime aussi les volumes (base **et photos**) : uniquement pour repartir de zéro.

## Limites de ce déploiement

- **Accès par IP en HTTP** : identifiants et mots de passe circulent en clair ; préférez le lien HTTPS
  Cloudflare. Pour un usage réel : un nom de domaine (ex. `tsenapro.mg`) avec HTTPS, et
  `NEXT_PUBLIC_SITE_URL` réglé sur ce domaine (liens SEO, sitemap).
- **Lien Cloudflare temporaire** : il change à chaque recréation du conteneur `tunnel`. Pour une
  adresse fixe, il faut un compte Cloudflare et un domaine (tunnel nommé).
- **Paiement** : Mobile Money uniquement ; `DEMO_PAYMENTS=true` simule les opérateurs (aucun argent
  réel) — à désactiver sur un vrai site.
