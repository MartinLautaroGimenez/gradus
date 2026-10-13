-- CreateEnum
CREATE TYPE "PeriodKind" AS ENUM ('REGULAR', 'COMPENSATORIO');

-- AlterTable
ALTER TABLE "GradingPeriod" ADD COLUMN     "kind" "PeriodKind" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "maxAbsences" INTEGER NOT NULL DEFAULT 20,
ALTER COLUMN "passingGrade" SET DEFAULT 7;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
