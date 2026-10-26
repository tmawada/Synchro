-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "ticktickAccessToken" TEXT,
ADD COLUMN     "ticktickId" TEXT,
ADD COLUMN     "ticktickRefreshToken" TEXT,
ADD COLUMN     "ticktickTokenExpiry" TIMESTAMP(3);
