-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "previous_token_hash" CHAR(64),
ADD COLUMN     "rotated_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_previous_token_hash_key" ON "sessions"("previous_token_hash");

