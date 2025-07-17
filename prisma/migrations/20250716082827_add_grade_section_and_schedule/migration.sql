-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "gradeSectionId" TEXT;

-- CreateTable
CREATE TABLE "GradeSection" (
    "id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "section" TEXT NOT NULL,

    CONSTRAINT "GradeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "teacher" TEXT NOT NULL,
    "gradeSectionId" TEXT NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeSection_grade_section_key" ON "GradeSection"("grade", "section");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_gradeSectionId_fkey" FOREIGN KEY ("gradeSectionId") REFERENCES "GradeSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_gradeSectionId_fkey" FOREIGN KEY ("gradeSectionId") REFERENCES "GradeSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
