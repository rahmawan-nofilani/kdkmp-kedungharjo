import type { InputHTMLAttributes,ReactNode } from "react";
import styles from "./ui.module.css";
type ChoiceProps=Omit<InputHTMLAttributes<HTMLInputElement>,"type">&{label:ReactNode;hint?:ReactNode};
function Choice({type,label,hint,className="",...props}:ChoiceProps&{type:"checkbox"|"radio"}){return <label className={`${styles.choice} ${className}`.trim()}><input type={type}{...props}/><span><strong>{label}</strong>{hint?<small>{hint}</small>:null}</span></label>}
export function Checkbox(props:ChoiceProps){return <Choice type="checkbox" {...props}/>}
export function Radio(props:ChoiceProps){return <Choice type="radio" {...props}/>}
export function Switch({label,hint,className="",...props}:ChoiceProps){return <label className={`${styles.switchRow} ${className}`.trim()}><span><strong>{label}</strong>{hint?<small>{hint}</small>:null}</span><input className={styles.switchInput} type="checkbox" role="switch" {...props}/></label>}
