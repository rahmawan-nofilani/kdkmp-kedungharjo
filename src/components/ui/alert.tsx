import type { ReactNode } from "react";
import styles from "./ui.module.css";

type AlertTone = "success" | "warning" | "danger" | "info";

type AlertProps = {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
};

const toneClass: Record<AlertTone, string> = {
  success: styles.successAlert,
  warning: styles.warningAlert,
  danger: styles.dangerAlert,
  info: styles.infoAlert,
};

export function Alert({ tone = "info", title, children, className = "" }: AlertProps) {
  return (
    <div className={`${styles.alert} ${toneClass[tone]} ${className}`.trim()} role={tone === "danger" ? "alert" : "status"}>
      <div>{title ? <strong>{title}</strong> : null}<p>{children}</p></div>
    </div>
  );
}
