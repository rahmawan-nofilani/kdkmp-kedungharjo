"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { commitCashSaleAction, type CashSaleActionState } from "./actions";
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

const initialCashSaleState: CashSaleActionState = { status: "idle" };

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

const ProductButton = memo(function ProductButton({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: (product: Product) => void;
}) {
  const unavailable = Boolean(product.track_stock && product.stock_qty <= 0);

  return (
    <button
      type="button"
      className={styles.productCard}
      onClick={() => onAdd(product)}
      disabled={unavailable}
      aria-label={`Tambah ${product.name} ke keranjang`}
      title={unavailable ? "Stok habis" : `Tambah ${product.name}`}
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
});

const MemberSelector = memo(function MemberSelector({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.memberField}>
      Anggota
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Umum / non-anggota</option>
        {members.map((member) => (
          <option value={member.id} key={member.id}>
            {member.member_number} · {member.full_name}
          </option>
        ))}
      </select>
    </label>
  );
});

function CheckoutButton({ disabled, total }: { disabled: boolean; total: number }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={disabled || pending} aria-busy={pending}>
      {pending ? "Memproses transaksi…" : `Bayar ${rupiah(total)}`}
    </button>
  );
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
  const router = useRouter();
  const handledSale = useRef<string | null>(null);
  const [actionState, formAction] = useActionState(commitCashSaleAction, initialCashSaleState);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [memberId, setMemberId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (
      actionState.status !== "success" ||
      !actionState.saleId ||
      handledSale.current === actionState.saleId
    ) return;

    handledSale.current = actionState.saleId;
    setCart([]);
    setMemberId("");
    setIdempotencyKey(crypto.randomUUID());
    router.refresh();
  }, [actionState, router]);

  const matchingProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) =>
      [product.sku, product.barcode, product.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [products, query]);

  const visibleProducts = useMemo(() => matchingProducts.slice(0, 60), [matchingProducts]);

  const { total, totalQty, itemsJson } = useMemo(() => {
    let nextTotal = 0;
    let nextQty = 0;

    for (const line of cart) {
      nextTotal += line.product.sell_amount * line.quantity;
      nextQty += line.quantity;
    }

    return {
      total: nextTotal,
      totalQty: nextQty,
      itemsJson: JSON.stringify(
        cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      ),
    };
  }, [cart]);

  const addProduct = useCallback((product: Product) => {
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
  }, []);

  const changeQuantity = useCallback((productId: string, delta: number) => {
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
  }, []);

  const removeLine = useCallback((productId: string) => {
    setCart((current) => current.filter((line) => line.product.id !== productId));
  }, []);

  const changeMember = useCallback((value: string) => setMemberId(value), []);

  return (
    <>
      {actionState.status === "success" ? (
        <div className={styles.successBanner}>
          <div>
            <span>{actionState.duplicate ? "TRANSAKSI DUPLIKAT DICEGAH" : "TRANSAKSI BERHASIL"}</span>
            {actionState.saleId ? (
              <Link className={styles.receiptLink} href={`/sales/${actionState.saleId}`}>
                {actionState.receiptNumber || "Buka struk transaksi"}
              </Link>
            ) : (
              <strong>{actionState.receiptNumber || "Receipt tersimpan"}</strong>
            )}
          </div>
          <strong>{rupiah(actionState.totalAmount || 0)}</strong>
        </div>
      ) : null}
      {actionState.status === "error" ? (
        <div className={styles.errorBanner}>{actionState.message || "Transaksi belum dapat diproses."}</div>
      ) : null}

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
                aria-label="Cari produk"
                autoFocus
              />
            </div>
          </div>

          <div className={styles.catalogMeta}>
            <span>{matchingProducts.length} produk cocok</span>
            {matchingProducts.length > visibleProducts.length ? (
              <small>60 pertama ditampilkan · gunakan pencarian untuk produk lainnya</small>
            ) : null}
          </div>

          <div className={styles.productGrid}>
            {visibleProducts.map((product) => (
              <ProductButton product={product} onAdd={addProduct} key={product.id} />
            ))}
          </div>

          {!matchingProducts.length ? (
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

          <MemberSelector members={members} value={memberId} onChange={changeMember} />

          <div className={styles.cartLines}>
            {cart.length ? (
              cart.map((line) => {
                const atStockLimit = Boolean(
                  line.product.track_stock && line.quantity >= line.product.stock_qty,
                );

                return (
                  <div className={styles.cartLine} key={line.product.id}>
                    <div className={styles.lineCopy}>
                      <strong>{line.product.name}</strong>
                      <span>{rupiah(line.product.sell_amount)} / {line.product.unit_name}</span>
                    </div>
                    <div className={styles.qtyControl} aria-label={`Jumlah ${line.product.name}`}>
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.product.id, -1)}
                        aria-label={`Kurangi ${line.product.name}`}
                        title="Kurangi jumlah"
                      >−</button>
                      <strong>{line.quantity}</strong>
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.product.id, 1)}
                        disabled={atStockLimit}
                        aria-label={`Tambah ${line.product.name}`}
                        title={atStockLimit ? "Jumlah sudah sama dengan stok tersedia" : "Tambah jumlah"}
                      >+</button>
                    </div>
                    <div className={styles.lineTotal}>
                      <strong>{rupiah(line.product.sell_amount * line.quantity)}</strong>
                      <button type="button" onClick={() => removeLine(line.product.id)}>Hapus</button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={styles.emptyCart}>Klik produk untuk menambah ke keranjang.</div>
            )}
          </div>

          <div className={styles.checkoutDock}>
            <div className={styles.summary}>
              <div><span>Subtotal</span><strong>{rupiah(total)}</strong></div>
              <div><span>Diskon</span><strong>Rp0</strong></div>
              <div className={styles.grandTotal}><span>Total</span><strong>{rupiah(total)}</strong></div>
            </div>

            <form action={formAction} className={styles.checkoutForm}>
              <input type="hidden" name="itemsJson" value={itemsJson} />
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <div className={styles.paymentMethod}>
                <span>Metode pembayaran</span>
                <strong>TUNAI / CASH</strong>
              </div>
              <CheckoutButton disabled={!cart.length || !idempotencyKey} total={total} />
              <p>
                Hasil transaksi tampil tanpa redirect penuh. Stok dan laporan direfresh setelah commit berhasil.
              </p>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
