import styles from "./kopdesku-brand.module.css";

type BrandVariant = "standard" | "mark";
type Props = {
  compact?: boolean;
  inverse?: boolean;
  /** Compatibility alias used by pre-v1.2 pages. Prefer inverse for new code. */
  dark?: boolean;
  markOnly?: boolean;
  variant?: BrandVariant;
  className?: string;
};

const ASSETS = {
  standard: "/brand/kopdesku/kopdesku-logo.svg",
  mark: "/brand/kopdesku/kopdesku-mark.svg",
  markWhite: "/brand/kopdesku/kopdesku-mark-white.svg",
} as const;

export function KopdesKuBrand({
  compact = false,
  inverse = false,
  dark = false,
  markOnly = false,
  variant = "standard",
  className = "",
}: Props) {
  const resolvedInverse = inverse || dark;
  const resolvedVariant: BrandVariant = markOnly ? "mark" : variant;
  const src = resolvedVariant === "mark" && resolvedInverse ? ASSETS.markWhite : ASSETS[resolvedVariant];
  const classes = [
    styles.brand,
    compact ? styles.compact : "",
    resolvedInverse ? styles.inverse : "",
    resolvedVariant === "mark" ? styles.markOnly : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={classes} data-brand-asset="production-v1.2">
      <img
        className={styles.logo}
        src={src}
        alt="KopdesKu"
        width={resolvedVariant === "mark" ? 64 : 220}
        height={resolvedVariant === "mark" ? 64 : 72}
      />
    </span>
  );
}
