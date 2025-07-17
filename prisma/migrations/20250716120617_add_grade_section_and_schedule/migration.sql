/*
  Warnings:

  - You are about to drop the column `day` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `period` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `teacher` on the `Schedule` table. All the data in the column will be lost.
  - Added the required column `schedule` to the `Schedule` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Schedule" DROP COLUMN "day",
DROP COLUMN "period",
DROP COLUMN "subject",
DROP COLUMN "teacher",
ADD COLUMN     "schedule" JSONB NOT NULL;
