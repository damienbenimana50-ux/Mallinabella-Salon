import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const services = [
  {
    name: "The Mallinabella Blowout",
    category: "Hair Styling",
    description: "A nourishing wash, smooth blowout, and polished finish.",
    durationMinutes: 60,
    price: 55,
  },
  {
    name: "Protective Silk Press",
    category: "Hair Styling",
    description: "A heat-conscious silk press with a soft, lasting finish.",
    durationMinutes: 90,
    price: 75,
  },
  {
    name: "Signature Knotless Braids",
    category: "Braiding",
    description: "Lightweight knotless braids, shaped and finished to your preference.",
    durationMinutes: 240,
    price: 180,
  },
  {
    name: "Classic Cornrows",
    category: "Braiding",
    description: "Clean, carefully finished cornrows in a classic style.",
    durationMinutes: 150,
    price: 90,
  },
  {
    name: "Dimensional Gloss",
    category: "Coloring",
    description: "A gloss treatment that refreshes tone and adds reflective shine.",
    durationMinutes: 120,
    price: 95,
  },
  {
    name: "Full Color Refresh",
    category: "Coloring",
    description: "A full-color refresh with a conditioning finish.",
    durationMinutes: 180,
    price: 145,
  },
  {
    name: "Scalp Reset Ritual",
    category: "Treatments",
    description: "A soothing cleanse, scalp massage, and restorative mask.",
    durationMinutes: 45,
    price: 45,
  },
  {
    name: "Gel Manicure",
    category: "Nails/Spa",
    description: "A shaping, cuticle care, and long-wear gel finish.",
    durationMinutes: 60,
    price: 45,
  },
  {
    name: "Restorative Spa Pedicure",
    category: "Nails/Spa",
    description: "A relaxing soak, exfoliation, and nourishing finish.",
    durationMinutes: 75,
    price: 60,
  },
];

const stylists = [
  { name: "Senior Stylist", title: "Hair styling & treatments" },
  { name: "Braiding Artist", title: "Protective styles & braiding" },
  { name: "Color Specialist", title: "Color & finishing" },
];

try {
  if ((await prisma.service.count()) === 0) {
    for (const service of services) {
      await prisma.service.create({ data: service });
    }
  }
  if ((await prisma.stylist.count()) === 0) {
    await prisma.stylist.createMany({ data: stylists });
  }
} finally {
  await prisma.$disconnect();
}
