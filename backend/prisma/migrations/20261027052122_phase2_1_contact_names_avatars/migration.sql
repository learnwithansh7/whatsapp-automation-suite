-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "profilePictureStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "profilePictureUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "savedName" TEXT,
ADD COLUMN     "verifiedName" TEXT;
