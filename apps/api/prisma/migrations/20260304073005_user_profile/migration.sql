-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarPath" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
