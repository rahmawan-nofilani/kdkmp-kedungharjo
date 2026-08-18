import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import styles from "./ui.module.css";

type FieldFrameProps = {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
};

function FieldFrame({ label, required = false, hint, error, children, className = "" }: FieldFrameProps) {
  return (
    <label className={`${styles.field} ${className}`.trim()}>
      <span className={styles.fieldLabel}>{label}{required ? <span className={styles.required}>*</span> : null}</span>
      {children}
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "required"> & Omit<FieldFrameProps, "children"> & { required?: boolean };
export function TextField({ label, hint, error, required, className, ...props }: TextFieldProps) {
  return <FieldFrame label={label} hint={hint} error={error} required={required} className={className}>
    <input className={`${styles.control} ${error ? styles.invalid : ""}`} required={required} {...props} />
  </FieldFrame>;
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "required"> & Omit<FieldFrameProps, "children"> & { required?: boolean; children: ReactNode };
export function SelectField({ label, hint, error, required, className, children, ...props }: SelectFieldProps) {
  return <FieldFrame label={label} hint={hint} error={error} required={required} className={className}>
    <select className={`${styles.select} ${error ? styles.invalid : ""}`} required={required} {...props}>{children}</select>
  </FieldFrame>;
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "required"> & Omit<FieldFrameProps, "children"> & { required?: boolean };
export function TextAreaField({ label, hint, error, required, className, ...props }: TextAreaFieldProps) {
  return <FieldFrame label={label} hint={hint} error={error} required={required} className={className}>
    <textarea className={`${styles.textarea} ${error ? styles.invalid : ""}`} required={required} {...props} />
  </FieldFrame>;
}
