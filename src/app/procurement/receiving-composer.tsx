"use client";

import { useMemo, useState } from "react";
import { postGoodsReceiptAction } from "./actions";
import styles from "./procurement.module.css";

type PoItem = {
  id: string;
  sku: string;
  product_name: string;
  unit_name: string;
  track_expiry: number;
  quantity_ordered: number;
  quantity_received: number;
  remaining_qty: number;
};

type Warehouse = { id: string; code: string; name: string };

type LineState = {
  quantityReceived: number;
  batchCode: string;
  expiryDate: string;
};

export default function ReceivingComposer({
  purchaseOrderId,
  items,
  warehouses,
}: {
  purchaseOrderId: string;
  items: PoItem[];
  warehouses: Warehouse[];
}) {
  const [state, setState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(items.map((item) => [item.id, { quantityReceived: 0, batchCode: "", expiryDate: "" }])),
  );

  const linesJson = useMemo(() => JSON.stringify(items.map((item) => ({
    purchaseOrderItemId: item.id,
    quantityReceived: state[item.id]?.quantityReceived || 0,
    batchCode: state[item.id]?.batchCode || null,
    expiryDate: state[item.id]?.expiryDate || null,
  }))), [items, state]);
  const totalQty = items.reduce((sum, item) => sum + (state[item.id]?.quantityReceived || 0), 0);

  function patch(id: string, change: Partial<LineState>) {
    setState((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }

  return (
    <form action={postGoodsReceiptAction} className={styles.receivingForm}>
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <input type="hidden" name="linesJson" value={linesJson} />
      <div className={styles.formGrid2}>
        <label>Gudang penerimaan
          <select name="warehouseId" required defaultValue="">
            <option value="" disabled>Pilih gudang</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
          </select>
        </label>
        <label>Catatan receiving
          <input name="notes" maxLength={200} placeholder="Nomor surat jalan / kondisi barang" />
        </label>
      </div>

      <div className={styles.receiveLines}>
        {items.map((item) => {
          const line = state[item.id];
          return (
            <div className={styles.receiveRow} key={item.id}>
              <div className={styles.receiveProduct}>
                <strong>{item.product_name}</strong>
                <span>{item.sku} · ordered {item.quantity_ordered} · received {item.quantity_received} · sisa {item.remaining_qty} {item.unit_name}</span>
              </div>
              <label>Terima
                <input
                  type="number"
                  min="0"
                  max={item.remaining_qty}
                  step="1"
                  value={line?.quantityReceived || 0}
                  onChange={(event) => patch(item.id, { quantityReceived: Math.min(item.remaining_qty, Math.max(0, Math.trunc(Number(event.target.value) || 0))) })}
                />
              </label>
              <label>Batch/lot
                <input value={line?.batchCode || ""} onChange={(event) => patch(item.id, { batchCode: event.target.value })} required={Boolean(item.track_expiry && (line?.quantityReceived || 0) > 0)} placeholder={item.track_expiry ? "Wajib" : "Opsional"} />
              </label>
              <label>Expiry
                <input type="date" value={line?.expiryDate || ""} onChange={(event) => patch(item.id, { expiryDate: event.target.value })} required={Boolean(item.track_expiry && (line?.quantityReceived || 0) > 0)} />
              </label>
            </div>
          );
        })}
      </div>

      <div className={styles.composerFooter}>
        <div><span>Total diterima</span><strong>{totalQty} unit</strong></div>
        <button type="submit" className={styles.primaryButton} disabled={!totalQty || !warehouses.length}>Posting Goods Receipt</button>
      </div>
    </form>
  );
}
