-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'content_reviewer', 'admin');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'user';
