import type { HTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

type CardProps = HTMLAttributes<HTMLElement> & {
  density?: "comfortable" | "compact";
  children: ReactNode;
};

export function Card({ density = "comfortable", className = "", children, ...props }: CardProps) {
  const densityClass = density === "compact" ? styles.cardCompact : styles.cardComfortable;
  return <article className={`${styles.card} ${densityClass} ${className}`.trim()} {...props}>{children}</article>;
}

export function CardHeader({ title, description, action, className = "" }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={`${styles.cardHeader} ${className}`.trim()}>
      <div>
        <h3 className={styles.cardTitle}>{title}</h3>
        {description ? <p className={styles.cardDescription}>{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
