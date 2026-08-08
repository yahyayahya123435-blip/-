/** SERVER-ONLY. Warehouses, inventory items, suppliers, stock in/out. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { paginationInput, paginationSkipTake, filsAmount } from '../lib/validation';
import { AppError } from '../lib/app-error';

// ---- Warehouses ----

export const warehouseInput = z.object({ name: z.string().trim().min(2).max(150), location: z.string().max(300).optional() });

export async function listWarehouses() {
  return getPrisma().warehouse.findMany({ orderBy: { name: 'asc' } });
}
export async function createWarehouse(actor: AuditActor, input: z.infer<typeof warehouseInput>) {
  const parsed = warehouseInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.warehouse.create({ data: parsed }));
}
export async function updateWarehouse(actor: AuditActor, id: string, input: Partial<z.infer<typeof warehouseInput>>) {
  return runWithAuditContext(actor, (tx) => tx.warehouse.update({ where: { id }, data: input }));
}

// ---- Inventory items ----

export const inventoryItemInput = z.object({
  warehouseId: z.string().min(1),
  name: z.string().trim().min(2).max(150),
  unit: z.string().trim().min(1).max(30),
  quantity: z.number().int().min(0).default(0),
  minQuantity: z.number().int().min(0).default(0),
  unitPriceFils: filsAmount.default(0),
  category: z.string().max(100).optional(),
});
export const updateInventoryItemInput = inventoryItemInput.partial().extend({ id: z.string().min(1) });
export const listInventoryItemsInput = paginationInput.extend({ warehouseId: z.string().optional(), lowStockOnly: z.boolean().optional() });

export async function listInventoryItems(input: z.infer<typeof listInventoryItemsInput>) {
  const parsed = listInventoryItemsInput.parse(input);
  const prisma = getPrisma();
  const where = {
    ...(parsed.warehouseId ? { warehouseId: parsed.warehouseId } : {}),
    ...(parsed.search ? { name: { contains: parsed.search } } : {}),
  };
  const [rowsRaw, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where, orderBy: { name: 'asc' }, ...paginationSkipTake(parsed),
      include: { warehouse: { select: { name: true } } },
    }),
    prisma.inventoryItem.count({ where }),
  ]);
  const rows = parsed.lowStockOnly ? rowsRaw.filter((r) => r.quantity <= r.minQuantity) : rowsRaw;
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getInventoryItem(id: string) {
  return getPrisma().inventoryItem.findUniqueOrThrow({ where: { id }, include: { warehouse: true, stockIns: true, stockOuts: true } });
}

export async function createInventoryItem(actor: AuditActor, input: z.infer<typeof inventoryItemInput>) {
  const parsed = inventoryItemInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.inventoryItem.create({ data: parsed }));
}
export async function updateInventoryItem(actor: AuditActor, input: z.infer<typeof updateInventoryItemInput>) {
  const parsed = updateInventoryItemInput.parse(input);
  const { id, quantity: _q, ...data } = parsed; // quantity changes only via stock in/out
  return runWithAuditContext(actor, (tx) => tx.inventoryItem.update({ where: { id }, data }));
}

// ---- Suppliers ----

export const supplierInput = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
});
export async function listSuppliers() {
  return getPrisma().supplier.findMany({ orderBy: { name: 'asc' } });
}
export async function createSupplier(actor: AuditActor, input: z.infer<typeof supplierInput>) {
  const parsed = supplierInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.supplier.create({ data: parsed }));
}
export async function updateSupplier(actor: AuditActor, id: string, input: Partial<z.infer<typeof supplierInput>>) {
  return runWithAuditContext(actor, (tx) => tx.supplier.update({ where: { id }, data: input }));
}

// ---- Stock in/out ----

export const stockInInput = z.object({
  inventoryItemId: z.string().min(1),
  supplierId: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPriceFils: filsAmount.default(0),
  referenceNo: z.string().max(100).optional(),
  receivedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(2000).optional(),
});
export const listStockInInput = paginationInput.extend({ inventoryItemId: z.string().optional() });

export async function listStockIn(input: z.infer<typeof listStockInInput>) {
  const parsed = listStockInInput.parse(input);
  const prisma = getPrisma();
  const where = { ...(parsed.inventoryItemId ? { inventoryItemId: parsed.inventoryItemId } : {}) };
  const [rows, total] = await Promise.all([
    prisma.stockIn.findMany({
      where, orderBy: { receivedAt: 'desc' }, ...paginationSkipTake(parsed),
      include: { inventoryItem: { select: { name: true, unit: true } }, supplier: { select: { name: true } } },
    }),
    prisma.stockIn.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function createStockIn(actor: AuditActor, input: z.infer<typeof stockInInput>) {
  const parsed = stockInInput.parse(input);
  const totalFils = parsed.quantity * parsed.unitPriceFils;
  return runWithAuditContext(actor, async (tx) => {
    const record = await tx.stockIn.create({ data: { ...parsed, totalFils } });
    await tx.inventoryItem.update({
      where: { id: parsed.inventoryItemId },
      data: { quantity: { increment: parsed.quantity } },
    });
    return record;
  });
}

export const stockOutInput = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.enum(['مساعدة', 'تالف', 'جرد', 'أخرى']),
  referenceId: z.string().optional(),
  issuedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(2000).optional(),
});
export const listStockOutInput = paginationInput.extend({ inventoryItemId: z.string().optional() });

export async function listStockOut(input: z.infer<typeof listStockOutInput>) {
  const parsed = listStockOutInput.parse(input);
  const prisma = getPrisma();
  const where = { ...(parsed.inventoryItemId ? { inventoryItemId: parsed.inventoryItemId } : {}) };
  const [rows, total] = await Promise.all([
    prisma.stockOut.findMany({
      where, orderBy: { issuedAt: 'desc' }, ...paginationSkipTake(parsed),
      include: { inventoryItem: { select: { name: true, unit: true } } },
    }),
    prisma.stockOut.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

/** Prevents negative stock at the app layer (DB trigger is the final guard). */
export async function createStockOut(actor: AuditActor, input: z.infer<typeof stockOutInput>) {
  const parsed = stockOutInput.parse(input);
  return runWithAuditContext(actor, async (tx) => {
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: parsed.inventoryItemId } });
    if (item.quantity < parsed.quantity) {
      throw new AppError('NEGATIVE_STOCK', 'الكمية المطلوبة تتجاوز الرصيد المتاح في المخزون');
    }
    const record = await tx.stockOut.create({ data: parsed });
    await tx.inventoryItem.update({
      where: { id: parsed.inventoryItemId },
      data: { quantity: { decrement: parsed.quantity } },
    });
    return record;
  });
}
