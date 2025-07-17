-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resourceType" TEXT NOT NULL,
    "link" TEXT,
    "file" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);
