import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/asyncHandler";
import type { CustomerInput } from "@erp/shared";

interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
}

export const customerService = {
  async list({ page, pageSize, search }: ListParams) {
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { company: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.customer.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async getById(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: { orderBy: { issueDate: "desc" }, take: 10 },
        leads: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!customer) throw ApiError.notFound("Customer not found");
    return customer;
  },

  create(input: CustomerInput) {
    return prisma.customer.create({ data: { ...input, email: input.email || null } });
  },

  async update(id: string, input: Partial<CustomerInput>) {
    return prisma.customer.update({ where: { id }, data: input });
  },

  async remove(id: string) {
    await prisma.customer.delete({ where: { id } });
  },

  listForExport() {
    return prisma.customer.findMany({ orderBy: { name: "asc" } });
  },
};
