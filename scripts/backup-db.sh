#!/bin/bash
# Backup MongoDB database using mongodump, compress, and rotate
# AUDIT-134

set -e

BACKUP_DIR="/root/xelitesolutions/backups/mongodb"
MONGO_URI=${MONGO_URI:-"mongodb://mongo:27017/joe"}
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_NAME="db_backup_${DATE}.archive.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "Starting database backup to $BACKUP_PATH..."

# Create compressed dump
mongodump --uri="$MONGO_URI" --archive="$BACKUP_PATH" --gzip

echo "Backup successful: $BACKUP_PATH"

# Rotate backups: Keep only the last 7 days of backups
echo "Rotating backups older than 7 days..."
find "$BACKUP_DIR" -type f -name "db_backup_*.archive.gz" -mtime +7 -exec rm {} \;

echo "Backup process completed."
