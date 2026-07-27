import 'dotenv/config';
import { prisma } from './lib/prisma';
async function main() {
  const docs = await prisma.doctor.findMany();
  console.log("Doctors in DB:", docs.length);
  if (docs.length > 0) {
    console.log(docs.map(d => ({ email: d.email })));
  }
}
main().finally(() => prisma.$disconnect());
