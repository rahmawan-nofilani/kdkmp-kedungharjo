import type { ButtonHTMLAttributes,ReactNode } from "react";
import styles from "./ui.module.css";
type ButtonVariant="primary"|"secondary"|"outline"|"danger"|"ghost";
type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:ButtonVariant;compact?:boolean;iconOnly?:boolean;children:ReactNode};
export function Button({variant="primary",compact=false,iconOnly=false,className="",children,...props}:ButtonProps){const classes=[styles.button,styles[variant],compact?styles.compact:"",iconOnly?styles.iconButton:"",className].filter(Boolean).join(" ");return <button className={classes}{...props}>{children}</button>}
