import styles from "./ui.module.css";

type MoneyTone = "neutral" | "positive" | "negative";

type MoneyValueProps = {
  value: number;
  strong?: boolean;
  tone?: MoneyTone;
  className?: string;
  currency?: string;
};

const toneClass: Record<MoneyTone, string> = {
  neutral: styles.moneyNeutral,
  positive: styles.moneyPositive,
  negative: styles.moneyNegative,
};

export function MoneyValue({ value, strong = false, tone = "neutral", className = "", currency = "IDR" }: MoneyValueProps) {
  const formatted = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

  return <span className={`${styles.money} ${strong ? styles.moneyStrong : ""} ${toneClass[tone]} ${className}`.trim()}>{formatted}</span>;
}
