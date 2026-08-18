import styles from "./kopdesku-brand.module.css";

type Props = {
  compact?: boolean;
  dark?: boolean;
  markOnly?: boolean;
  className?: string;
};

const REFERENCE_MARK = "/brand/kopdesku/kopdesku-mark-reference.svg";

export function KopdesKuBrand({ compact = false, dark = false, markOnly = false, className = "" }: Props) {
  const classes = [styles.brand, compact ? styles.compact : "", dark ? styles.dark : "", markOnly ? styles.markOnly : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} data-brand-asset="reference">
      <img
        className={styles.mark}
        src={REFERENCE_MARK}
        alt={markOnly ? "KopdesKu" : ""}
        width={160}
        height={190}
      />
      {!markOnly ? (
        <span className={styles.copy}>
          <strong className={styles.name}>KopdesKu</strong>
          <span className={styles.descriptor}>Integrated Platform</span>
        </span>
      ) : null}
    </span>
  );
}
