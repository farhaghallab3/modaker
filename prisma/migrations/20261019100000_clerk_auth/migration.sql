-- Sign-in moves to Clerk (Google + email). Existing rows are kept; Clerk users are linked by
-- clerkId on first sight, and new users have no local password.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL,
ADD COLUMN     "clerkId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
