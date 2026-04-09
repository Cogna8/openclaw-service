-- CreateEnum
CREATE TYPE "portal_role_t" AS ENUM ('user', 'admin', 'super_admin');

-- CreateTable
CREATE TABLE "portal_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" "portal_role_t" NOT NULL DEFAULT 'user',
    "google_id" TEXT NOT NULL,
    "openclaw_account_id" TEXT,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_login_at" TIMESTAMPTZ,

    CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_email_key" ON "portal_users"("email");
CREATE UNIQUE INDEX "portal_users_google_id_key" ON "portal_users"("google_id");
