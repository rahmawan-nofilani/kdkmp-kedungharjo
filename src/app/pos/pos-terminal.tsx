"use client";

import { useEffect, useMemo, useState } from "react";
import { commitCashSaleAction } from "./actions";
import styles from "./pos.module.css";

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit_name: string;
  sell_amount: number;
  stock_qty: number;
  track_stock: number;
};

type Member = {
  id: string;
  member_number: string;
  full_name: string;
};

type CartLine = {
  product: Product;
  quantity: number;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PosTerminal({
  products,
  members,
  warehouseName,
}: {
  products: Product[];
  members: Member[];
  warehouseName: string;
}) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [memberId, setMemberId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) =>
      [product.sku, product.barcode, product.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [products, query]);

  const total = cart.reduce(
    (sum, line) => sum + line.product.sell_amount * line.quantity,
    0,
  );
  const totalQty = cart.reduce((sum, line) => sum + line.quantity, 0);

  function addProduct(product: Product) {
    if (product.track_stock && product.stock_qty <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        const nextQuantity = existing.quantity + 1;
        if (product.track_stock && nextQuantity > product.stock_qty) return current;
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: nextQuantity } : line,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.product.id !== productId) return line;
          const nextQuantity = line.quantity + delta;
          if (line.product.track_stock && nextQuantity > line.product.stock_qty) return line;
          return { ...line, quantity: nextQuantity };
        })
        .filter((line) => line.quantity > 0),
    );
  }

  function removeLine(productId: string) {
    setCart((current) => current.filter((line) => line.product.id !== productId));
  }

  const itemsJson = JSON.stringify(
    cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
  );

  return (
    <div className={styles.terminalGrid}>
      <section className={styles.catalogPanel}>
        <div className={styles.catalogHeader}>
          <div>
            <span className={styles.kicker}>KATALOG · {warehouseName}</span>
            <h2>Pilih barang</h2>
          </div>
          <div className={styles.searchBox}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama, SKU, atau barcode..."
              autoFocus
            />
          </div>
        </div>

        <div className={styles.productGrid}>
          {filtered.map((product) => {
            const unavailable = Boolean(product.track_stock && product.stock_qty <= 0);
            return (
              <button
                type="button"
                className={styles.productCard}
                onClick={() => addProduct(product)}
                disabled={unavailable}
                key={product.id}
              >
                <span className={styles.productSku}>{product.sku}</span>
                <strong>{product.name}</strong>
                <span className={styles.productPrice}>{rupiah(product.sell_amount)}</span>
                <small>
                  {product.track_stock
                    ? `Stok ${product.stock_qty} ${product.unit_name}`
                    : "Non-stock item"}
                </small>
              </button>
            );
          })}
        </div>

        {!filtered.length ? (
          <div className={styles.empty}>Produk tidak ditemukan.</div>
        ) : null}
      </section>

      <aside className={styles.cartPanel}>
        <div className={styles.cartHeader}>
          <div>
            <span className={styles.kicker}>KERANJANG</span>
            <h2>Transaksi baru</h2>
          </div>
          <span className={styles.cartCount}>{totalQty} item</span>
        </div>

        <label className={styles.memberField}>
          Anggota
          <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            <option value="">Umum / non-anggota</option>
            {members.map((member) => (
              <option value={member.id} key={member.id}>
                {member.member_number} · {member.full_name}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.cartLines}>
          {cart.length ? (
            cart.map((line) => (
              <div className={styles.cartLine} key={line.product.id}>
                <div className={styles.lineCopy}>
                  <strong>{line.product.name}</strong>
                  <span>{rupiah(line.product.sell_amount)} / {line.product.unit_name}</span>
                </div>
                <div className={styles.qtyControl}>
                  <button type="button" onClick={() => changeQuantity(line.product.id, -1)}>−</button>
                  <strong>{line.quantity}</strong>
                  <button type="button" onClick={() => changeQuantity(line.product.id, 1)}>+</button>
                </div>
                <div className={styles.lineTotal}>
                  <strong>{rupiah(line.product.sell_amount * line.quantity)}</strong>
                  <button type="button" onClick={() => removeLine(line.product.id)}>Hapus</button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.emptyCart}>Klik produk untuk menambah ke keranjang.</div>
          )}
        </div>

        <div className={styles.summary}>
          <div><span>Subtotal</span><strong>{rupiah(total)}</strong></div>
          <div><span>Diskon</span><strong>Rp0</strong></div>
          <div className={styles.grandTotal}><span>Total</span><strong>{rupiah(total)}</strong></div>
        </div>

        <form action={commitCashSaleAction} className={styles.checkoutForm}>
          <input type="hidden" name="itemsJson" value={itemsJson} />
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <div className={styles.paymentMethod}>
            <span>Metode pembayaran</span>
            <strong>TUNAI / CASH</strong>
          </div>
          <button type="submit" disabled={!cart.length || !idempotencyKey}>
            Bayar {rupiah(total)}
          </button>
          <p>
            Satu klik saja. Sistem memakai idempotency key dan transaction batch untuk mencegah transaksi ganda atau setengah tersimpan.
          </p>
        </form>
      </aside>
    </div>
  );
}
