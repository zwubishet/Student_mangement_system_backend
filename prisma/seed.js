import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const password = "pass123";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.student.upsert({
    where: { studentId: "STD123" },
    update: { passwordHash }, // In case student exists, update the hash
    create: {
      studentId: "STD123",
      fullName: "Test Student",
      passwordHash,
    },
  });

  console.log("✅ Seeded student with passwordHash:", passwordHash);
}

main()
  .catch((e) => console.error("❌ Seed error:", e))
  .finally(() => prisma.$disconnect());
