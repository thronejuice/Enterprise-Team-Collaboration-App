-- v0.1.1: user profile, departments, offboarding (suspensions), host handover.

-- CreateEnum
CREATE TYPE "SuspensionReason" AS ENUM ('RESIGNED', 'TERMINATED', 'LONG_LEAVE', 'SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "SuspensionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'CANCELLED', 'LIFTED');

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- AlterTable: users (profile fields)
ALTER TABLE "users"
    ADD COLUMN "first_name" TEXT,
    ADD COLUMN "last_name" TEXT,
    ADD COLUMN "employee_id" TEXT,
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "job_title" TEXT,
    ADD COLUMN "department_id" UUID,
    ADD COLUMN "avatar_key" TEXT,
    ADD COLUMN "avatar_updated_at" TIMESTAMP(3),
    ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "last_login_at" TIMESTAMP(3),
    ADD COLUMN "anonymized_at" TIMESTAMP(3);

-- AlterTable: meetings (host handover). Backfill from created_by before NOT NULL.
ALTER TABLE "meetings" ADD COLUMN "host_id" UUID;
UPDATE "meetings" SET "host_id" = "created_by";
ALTER TABLE "meetings" ALTER COLUMN "host_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "user_suspensions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" "SuspensionReason" NOT NULL,
    "note" TEXT,
    "status" "SuspensionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "effective_at" TIMESTAMP(3) NOT NULL,
    "handover_to" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "lifted_at" TIMESTAMP(3),
    "lifted_by" UUID,
    "lift_note" TEXT,

    CONSTRAINT "user_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");
CREATE UNIQUE INDEX "departments_name_lower" ON "departments" (lower("name"));
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");
CREATE INDEX "users_department_id_idx" ON "users"("department_id");
CREATE INDEX "meetings_host_id_idx" ON "meetings"("host_id");
CREATE INDEX "user_suspensions_status_effective_at_idx" ON "user_suspensions"("status", "effective_at");
CREATE INDEX "user_suspensions_user_id_idx" ON "user_suspensions"("user_id");

-- 1 user มีการระงับที่ยังมีผลหรือรอมีผลได้ไม่เกิน 1 รายการ
CREATE UNIQUE INDEX "user_suspensions_one_open"
  ON "user_suspensions" ("user_id") WHERE "status" IN ('SCHEDULED', 'ACTIVE');

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_suspensions" ADD CONSTRAINT "user_suspensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
