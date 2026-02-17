import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

export async function connectDb() {
  await prisma.$connect()
  console.log('Connected to database')
}

export async function disconnectDb() {
  await prisma.$disconnect()
}
