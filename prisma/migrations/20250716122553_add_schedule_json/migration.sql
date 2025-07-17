/*
  Warnings:

  - You are about to drop the column `schedule` on the `Schedule` table. All the data in the column will be lost.
  - Added the required column `weekSchedule` to the `Schedule` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Schedule" DROP COLUMN "schedule",
ADD COLUMN     "weekSchedule" JSONB NOT NULL;
