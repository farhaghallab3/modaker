-- Recitation scoring can now say "we are not sure" instead of blaming the learner for a speech-recognition doubt.
-- AlterEnum
ALTER TYPE "MistakeType" ADD VALUE 'uncertain';

-- AlterEnum
ALTER TYPE "RecitationAyahStatus" ADD VALUE 'uncertain';
