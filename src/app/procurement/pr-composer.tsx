"use client";

import { useMemo, useState } from "react";
import { createPurchaseRequestAction } from "./actions";
import styles from "./procurement.module.css";

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  unit_name: string;
  cost_amount: number;
};

type SupplierOption = {
  id: string;
  code: string;
  name: string;
};

type DraftLine = {
  key: string;
  productId: string;
  quantity: number;
  estimatedUnitCostAmount: number;
};

function money(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default function PrComposer({ products, suppliers }: { products: ProductOption[]; suppliers: SupplierOption[] }) {
  const [lines, setLines] = useState<DraftLine[]>([
    { key: crypto.randomUUID(), productId: "", quantity: 1, estimatedUnitCostAmount: 0 },
  ]);

  const itemsJson = useMemo(
    () => JSON.stringify(lines.filter((line) => line.productId && line.quantity > 0).map(({ productId, quantity, estimatedUnitCostAmount }) => ({ productId, quantity, estimatedUnitCostAmount }))),
    [lines],
  );
  const total = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.estimatedUnitCostAmount), 0), [lines]);

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function selectProduct(key: string, productId: string) {
    const product = products.find((item) => item.id === productId);
    patchLine(key, {
      productId,
      estimatedUnitCostAmount: product ? Number(product.cost_amount) : 0,
    });
  }

  function addLine() {
    if (lines.length >= 10) return;
    setLines((current) => [...current, { key: crypto.randomUUID(), productId: "", quantity: 1, estimatedUnitCostAmount: 0 }]);
  }

  function removeLine(key: string) {
    setLines((current) => current.length === 1 ? current : current.filter((line) => line.key !== key));
  }

  return (
    <form action={createPurchaseRequestAction} className={styles.prComposer}>
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <div className={styles.formGrid2}>
        <label>Supplier pilihan
          <select name="preferredSupplierId" defaultValue="">
            <option value="">Belum ditentukan</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}
          </select>
        </label>
        <label>Catatan kebutuhan
          <input name="notes" placeholder="Contoh: restock kebutuhan gerai pekan ini" maxLength={200} />
        </label>
      </div>

      <div className={styles.lineEditor}>
        {lines.map((line, index) => {
          const product = products.find((item) => item.id === line.productId);
          return (
            <div className={styles.lineRow} key={line.key}>
              <span className={styles.lineNo}>{String(index + 1).padStart(2, "0")}</span>
              <label>Produk
                <select value={line.productId} onChange={(event) => selectProduct(line.key, event.target.value)} required>
                  <option value="">Pilih produk</option>
                  {products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
                </select>
              </label>
              <label>Qty
                <input type="number" min="1" step="1" value={line.quantity} onChange={(event) => patchLine(line.key, { quantity: Math.max(1, Number(event.target.value) || 1) })} />
              </label>
              <label>Estimasi HPP/unit
                <input inputMode="numeric" value={line.estimatedUnitCostAmount} onChange={(event) => patchLine(line.key, { estimatedUnitCostAmount: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} />
              </label>
              <div className={styles.lineTotal}>
                <span>{product?.unit_name || "—"}</span>
                <strong>{money(line.quantity * line.estimatedUnitCostAmount)}</strong>
              </div>
              <button className={styles.removeLine} type="button" onClick={() => removeLine(line.key)} disabled={lines.length === 1} aria-label="Hapus baris">×</button>
            </div>
          );
        })}
      </div>

      <div className={styles.composerFooter}>
        <button type="button" className={styles.secondaryButton} onClick={addLine} disabled={lines.length >= 10}>+ Tambah item</button>
        <div><span>Estimasi PR</span><strong>{money(total)}</strong></div>
        <button type="submit" className={styles.primaryButton} disabled={!products.length || !lines.some((line) => line.productId)}>Submit Purchase Request</button>
      </div>
    </form>
  );
}
