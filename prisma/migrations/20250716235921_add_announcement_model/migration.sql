-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "gradeId" TEXT,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "GradeSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
