import { z } from 'zod';
import { handlePermitted } from './handler';
import * as svc from '../../src/services/inventory';

export function registerInventoryHandlers(): void {
  handlePermitted('warehouses:list', 'inventory', 'view', async () => svc.listWarehouses());
  handlePermitted<z.infer<typeof svc.warehouseInput>>('warehouses:create', 'inventory', 'create', async ({ user, payload }) =>
    svc.createWarehouse({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string } & Partial<z.infer<typeof svc.warehouseInput>>>('warehouses:update', 'inventory', 'update', async ({ user, payload }) => {
    const { id, ...rest } = payload;
    return svc.updateWarehouse({ userId: user.id, username: user.username }, id, rest);
  });

  handlePermitted<z.infer<typeof svc.listInventoryItemsInput>>('inventoryItems:list', 'inventory', 'view', async ({ payload }) =>
    svc.listInventoryItems(payload),
  );
  handlePermitted<{ id: string }>('inventoryItems:get', 'inventory', 'view', async ({ payload }) => svc.getInventoryItem(payload.id));
  handlePermitted<z.infer<typeof svc.inventoryItemInput>>('inventoryItems:create', 'inventory', 'create', async ({ user, payload }) =>
    svc.createInventoryItem({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateInventoryItemInput>>('inventoryItems:update', 'inventory', 'update', async ({ user, payload }) =>
    svc.updateInventoryItem({ userId: user.id, username: user.username }, payload),
  );

  handlePermitted('suppliers:list', 'inventory', 'view', async () => svc.listSuppliers());
  handlePermitted<z.infer<typeof svc.supplierInput>>('suppliers:create', 'inventory', 'create', async ({ user, payload }) =>
    svc.createSupplier({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string } & Partial<z.infer<typeof svc.supplierInput>>>('suppliers:update', 'inventory', 'update', async ({ user, payload }) => {
    const { id, ...rest } = payload;
    return svc.updateSupplier({ userId: user.id, username: user.username }, id, rest);
  });

  handlePermitted<z.infer<typeof svc.listStockInInput>>('stockIn:list', 'inventory', 'view', async ({ payload }) => svc.listStockIn(payload));
  handlePermitted<z.infer<typeof svc.stockInInput>>('stockIn:create', 'inventory', 'create', async ({ user, payload }) =>
    svc.createStockIn({ userId: user.id, username: user.username }, payload),
  );

  handlePermitted<z.infer<typeof svc.listStockOutInput>>('stockOut:list', 'inventory', 'view', async ({ payload }) => svc.listStockOut(payload));
  handlePermitted<z.infer<typeof svc.stockOutInput>>('stockOut:create', 'inventory', 'create', async ({ user, payload }) =>
    svc.createStockOut({ userId: user.id, username: user.username }, payload),
  );
}
