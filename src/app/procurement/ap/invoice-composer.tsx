"use client";

import { useMemo, useState } from "react";
import { createSupplierInvoiceAction } from "./actions";
import styles from "./ap.module.css";

type PoLine = {
  id: string;
  product_name: string;
  sku: string;
  quantity_received: number;
  unit_cost_amount: number;
};

type EligiblePo = {
  id: string;
  po_number: string;
  supplier_name: string;
  lines: PoLine[];
};

type DraftLine = { quantityBilled: number; unitCostAmount: number };

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default function InvoiceComposer({ purchaseOrders }: { purchaseOrders: EligiblePo[] }) {
  const [selectedPoId, setSelectedPoId] = useState(purchaseOrders[0]?.id || "");
  const selectedPo = purchaseOrders.find((po) => po.id === selectedPoId) || null;
  const [overrides, setOverrides] = useState<Record<string, DraftLine>>({});

  const lines = useMemo(() => (selectedPo?.lines || []).map((line) => ({
    purchaseOrderItemId: line.id,
    quantityBilled: overrides[line.id]?.quantityBilled ?? line.quantity_received,
    unitCostAmount: overrides[line.id]?.unitCostAmount ?? line.unit_cost_amount,
  })), [selectedPo, overrides]);
  const linesJson = useMemo(() => JSON.stringify(lines), [lines]);
  const total = lines.reduce((sum, line) => sum + line.quantityBilled * line.unitCostAmount, 0);

  function patch(id: string, patchValue: Partial<DraftLine>, base: DraftLine) {
    setOverrides((current) => ({ ...current, [id]: { ...(current[id] || base), ...patchValue } }));
  }

  if (!purchaseOrders.length) return <div className={styles.empty}>Belum ada PO RECEIVED yang siap dibuatkan invoice.</div>;

  return (
    <form action={createSupplierInvoiceAction} className={styles.invoiceComposer}>
      <input type="hidden" name="linesJson" value={linesJson} />
      <div className={styles.grid4}>
        <label>Purchase Order
          <select name="purchaseOrderId" value={selectedPoId} onChange={(event) => { setSelectedPoId(event.target.value); setOverrides({}); }} required>
            {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number} · {po.supplier_name}</option>)}
          </select>
        </label>
        <label>Nomor invoice<input name="invoiceNumber" required maxLength={80} placeholder="INV-SUPPLIER-001" /></label>
        <label>Tanggal invoice<input name="invoiceDate" type="date" required /></label>
        <label>Jatuh tempo<input name="dueDate" type="date" /></label>
      </div>

      <div className={styles.invoiceLines}>
        {(selectedPo?.lines || []).map((line) => {
          const current = overrides[line.id] || { quantityBilled: line.quantity_received, unitCostAmount: line.unit_cost_amount };
          return <div className={styles.invoiceLine} key={line.id}>
            <div><strong>{line.product_name}</strong><span>{line.sku} · received {line.quantity_received}</span></div>
            <label>Qty invoice<input type="number" min="1" step="1" value={current.quantityBilled} onChange={(event) => patch(line.id, { quantityBilled: Math.max(1, Math.trunc(Number(event.target.value) || 1)) }, current)} /></label>
            <label>Harga/unit<input inputMode="numeric" value={current.unitCostAmount} onChange={(event) => patch(line.id, { unitCostAmount: Math.max(0, Math.trunc(Number(event.target.value) || 0)) }, current)} /></label>
            <div className={styles.lineAmount}><span>Line total</span><strong>{rupiah(current.quantityBilled * current.unitCostAmount)}</strong></div>
          </div>;
        })}
      </div>

      <div className={styles.footer}>
        <div><span>Total invoice</span><strong>{rupiah(total)}</strong></div>
        <button type="submit" disabled={!selectedPo || !lines.length}>Simpan Invoice Draft</button>
      </div>
    </form>
  );
}
