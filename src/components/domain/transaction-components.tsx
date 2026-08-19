import type { ReactNode } from "react";
import styles from "./domain.module.css";

function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}

export function ProductCard({sku,name,price,stockQty,unitName,trackStock,onClick,disabled=false}:{sku:string;name:string;price:number;stockQty:number;unitName:string;trackStock:boolean;onClick?:()=>void;disabled?:boolean}){
  const stockClass=!trackStock?"":stockQty<=0?styles.stockOut:stockQty<=5?styles.stockLow:styles.stockOk;
  return <button type="button" className={styles.productCard} onClick={onClick} disabled={disabled} aria-label={`Tambah ${name} ke keranjang`}>
    <div className={styles.productMeta}><span>{sku}</span><span className={stockClass}>{trackStock?`Stok ${stockQty}`:"Non-stock"}</span></div>
    <h3>{name}</h3><strong className={styles.productPrice}>{rupiah(price)}</strong><span className={styles.productMeta}>{unitName}</span>
  </button>
}

export function CartItem({name,unitPrice,unitName,quantity,total,atStockLimit,onDecrease,onIncrease,onRemove}:{name:string;unitPrice:number;unitName:string;quantity:number;total:number;atStockLimit?:boolean;onDecrease:()=>void;onIncrease:()=>void;onRemove:()=>void}){
  return <div className={styles.cartItem}>
    <div className={styles.cartCopy}><strong>{name}</strong><span>{rupiah(unitPrice)} / {unitName}</span></div>
    <div className={styles.qtyControl} aria-label={`Jumlah ${name}`}><button type="button" onClick={onDecrease} aria-label={`Kurangi ${name}`}>−</button><strong>{quantity}</strong><button type="button" onClick={onIncrease} disabled={atStockLimit} aria-label={`Tambah ${name}`}>+</button></div>
    <div className={styles.cartAmount}><strong>{rupiah(total)}</strong><button className={styles.remove} type="button" onClick={onRemove}>Hapus</button></div>
  </div>
}

export function PaymentSummary({subtotal,discount=0,total,method="TUNAI / CASH"}:{subtotal:number;discount?:number;total:number;method?:string}){
  return <div><div className={styles.summary}><div className={styles.summaryRow}><span>Subtotal</span><strong>{rupiah(subtotal)}</strong></div><div className={styles.summaryRow}><span>Diskon</span><strong>{rupiah(discount)}</strong></div><div className={`${styles.summaryRow} ${styles.summaryGrand}`}><span>Total</span><strong>{rupiah(total)}</strong></div></div><div className={styles.paymentMethod}><span>Metode pembayaran</span><strong>{method}</strong></div></div>
}

export function SensitiveAction({summary,impact,children,note}:{summary:ReactNode;impact?:ReactNode;children:ReactNode;note?:ReactNode}){
  return <details className={styles.sensitive}><summary>{summary}</summary><div className={styles.sensitiveBody}>{impact?<div className={styles.impact}>{impact}</div>:null}{children}{note?<p className={styles.sensitiveNote}>{note}</p>:null}</div></details>
}
