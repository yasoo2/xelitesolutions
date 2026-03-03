#!/bin/bash
# MongoDB Automatic Backup Script
# Run: bash /app/scripts/backup.sh

BACKUP_DIR="/root/xelitesolutions/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mongo_backup_${TIMESTAMP}"

echo "[Backup] Starting MongoDB backup: ${BACKUP_NAME}"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Run mongodump (connect to mongo container via Docker network)
mongodump --uri="mongodb://mongo:27017/joe" --out="${BACKUP_DIR}/${BACKUP_NAME}" 2>&1

if [ $? -eq 0 ]; then
    # Compress backup
    cd "${BACKUP_DIR}" && tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}" && rm -rf "${BACKUP_NAME}"
    echo "[Backup] ✅ Backup completed: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
    
    # Remove old backups (older than RETENTION_DAYS)
    find "${BACKUP_DIR}" -name "mongo_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete
    echo "[Backup] 🧹 Cleaned up backups older than ${RETENTION_DAYS} days"
else
    echo "[Backup] ❌ Backup FAILED!"
    exit 1
fi
