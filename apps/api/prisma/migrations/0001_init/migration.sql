-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'HOST', 'MEMBER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('REQUESTED', 'STARTING', 'RECORDING', 'STOPPING', 'FINALIZING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "meeting_id" UUID NOT NULL,
    "room_code" CHAR(4) NOT NULL,
    "title" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("meeting_id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "meeting_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "admitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_joined_at" TIMESTAMP(3),
    "last_joined_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("meeting_id","user_id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "recording_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "egress_job_id" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'REQUESTED',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "object_key" TEXT NOT NULL,
    "file_size" BIGINT,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("recording_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "meetings_room_code_status_idx" ON "meetings"("room_code", "status");

-- CreateIndex
CREATE INDEX "meeting_participants_user_id_idx" ON "meeting_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_egress_job_id_key" ON "recordings"("egress_job_id");

-- CreateIndex
CREATE INDEX "recordings_room_id_idx" ON "recordings"("room_id");

-- CreateIndex
CREATE INDEX "recordings_status_idx" ON "recordings"("status");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("meeting_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "meetings"("meeting_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Room codes are exactly four decimal digits and unique among ACTIVE meetings only.
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_room_code_format" CHECK ("room_code" ~ '^[0-9]{4}$');
CREATE UNIQUE INDEX "meetings_active_room_code_key" ON "meetings"("room_code") WHERE "status" = 'ACTIVE';

-- At most one in-flight recording per meeting.
CREATE UNIQUE INDEX "recordings_one_active_per_meeting_key" ON "recordings"("room_id")
  WHERE "status" IN ('REQUESTED', 'STARTING', 'RECORDING', 'STOPPING', 'FINALIZING');
