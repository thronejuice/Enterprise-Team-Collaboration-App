#!/bin/sh
# Idempotent MinIO bootstrap: private bucket + least-privilege identities.
set -eu

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

mc mb --ignore-existing "local/$S3_BUCKET"
mc anonymous set none "local/$S3_BUCKET"

# Egress may write recordings only (meetings/*), so it cannot overwrite avatars.
cat > /tmp/egress-writer.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET/meetings/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucketMultipartUploads"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET"]
    }
  ]
}
JSON

# API reads and deletes recordings, and writes avatars only (v0.1.1 profile photos).
cat > /tmp/api-reader.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET/avatars/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET"]
    }
  ]
}
JSON

mc admin policy create local egress-writer /tmp/egress-writer.json
mc admin policy create local api-reader /tmp/api-reader.json

mc admin user add local "$EGRESS_ACCESS_KEY" "$EGRESS_SECRET_KEY"
mc admin user add local "$API_ACCESS_KEY" "$API_SECRET_KEY"

attach() {
  if ! out=$(mc admin policy attach local "$1" --user "$2" 2>&1); then
    case "$out" in
      *"already"*) echo "policy $1 already attached to $2" ;;
      *) echo "$out" >&2; exit 1 ;;
    esac
  fi
}
attach egress-writer "$EGRESS_ACCESS_KEY"
attach api-reader "$API_ACCESS_KEY"

echo "minio-init: bucket '$S3_BUCKET' is private; egress/api identities configured"
