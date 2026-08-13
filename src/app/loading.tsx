import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-label="Memuat halaman">
      <div className={styles.progress} aria-hidden="true"><span /></div>
      <div className={styles.pill}>
        <span className={styles.spinner} aria-hidden="true" />
        <strong>Memuat…</strong>
      </div>
    </div>
  );
}
