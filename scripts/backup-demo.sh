#!/usr/bin/env bash
# Sauvegarde de la démo Tsena sur le VPS : base PostgreSQL (commandes, comptes, produits) + photos téléversées.
#
# À lancer sur le serveur, depuis /opt/tsena-pro :
#   bash scripts/backup-demo.sh
# Chaque nuit à 3 h (crontab -e, en root) :
#   0 3 * * * cd /opt/tsena-pro && bash scripts/backup-demo.sh >> backups/backup.log 2>&1
#
# Les fichiers vont dans backups/ (lisibles par root seulement) et sont gardés KEEP_DAYS jours (14 par défaut).
# ⚠️ Une sauvegarde restée sur le même serveur ne protège pas d'une panne du serveur : copiez régulièrement
# backups/ ailleurs (Contabo Object Storage, rclone vers Google Drive, scp vers un PC).
#
# Restauration (remplace les données actuelles) :
#   gunzip -c backups/db-AAAAMMJJ-HHMM.sql.gz | docker compose -f docker-compose.demo.yml --env-file .env.demo \
#     exec -T postgres psql -U tsenapro -d tsenapro
#   docker run --rm -v tsena-pro_uploads_data:/data -v "$PWD/backups":/backup alpine \
#     sh -c 'cd /data && tar xzf /backup/uploads-AAAAMMJJ-HHMM.tar.gz'
set -euo pipefail
umask 077

KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M)"
DIR="backups"
compose() { docker compose -f docker-compose.demo.yml --env-file .env.demo "$@"; }

[ -f docker-compose.demo.yml ] || { echo "Lancer depuis /opt/tsena-pro" >&2; exit 1; }
mkdir -p "$DIR"

# Base de données : export cohérent pendant que le site tourne ; fichier temporaire puis renommage,
# pour ne jamais laisser une sauvegarde incomplète sous un nom valide
compose exec -T postgres pg_dump -U tsenapro -d tsenapro --no-owner --clean --if-exists \
  | gzip -9 > "$DIR/db-$STAMP.sql.gz.part"
mv "$DIR/db-$STAMP.sql.gz.part" "$DIR/db-$STAMP.sql.gz"

# Photos des produits (volume Docker du backend)
docker run --rm -v tsena-pro_uploads_data:/data:ro -v "$PWD/$DIR":/backup alpine \
  tar czf "/backup/uploads-$STAMP.tar.gz.part" -C /data .
mv "$DIR/uploads-$STAMP.tar.gz.part" "$DIR/uploads-$STAMP.tar.gz"

# Anciennes sauvegardes
find "$DIR" -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "$(date '+%F %T') sauvegarde OK : $(du -h "$DIR/db-$STAMP.sql.gz" | cut -f1) base, $(du -h "$DIR/uploads-$STAMP.tar.gz" | cut -f1) photos"
