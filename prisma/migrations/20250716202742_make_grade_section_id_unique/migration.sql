/*
  Warnings:

  - A unique constraint covering the columns `[gradeSectionId]` on the table `Schedule` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Schedule_gradeSectionId_key" ON "Schedule"("gradeSectionId");
