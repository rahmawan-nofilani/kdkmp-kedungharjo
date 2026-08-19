import type { ReactNode } from "react";
import styles from "./ui.module.css";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
};

const toneClass: Record<BadgeTone, string> = {
  neutral: styles.neutralBadge,
  success: styles.successBadge,
  warning: styles.warningBadge,
  danger: styles.dangerBadge,
  info: styles.infoBadge,
};

export function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return <span className={`${styles.badge} ${toneClass[tone]} ${className}`.trim()}>{children}</span>;
}
