import type { ReactNode } from "react";
import styles from "./ui.module.css";
export function Skeleton({width="100%",height=16,rounded=true,className=""}:{width?:string|number;height?:string|number;rounded?:boolean;className?:string}){return <span className={`${styles.skeleton} ${rounded?styles.skeletonRounded:""} ${className}`.trim()} style={{width,height}} aria-hidden="true"/>}
export function EmptyState({title,description,action,icon}:{title:string;description?:ReactNode;action?:ReactNode;icon?:ReactNode}){return <div className={styles.emptyState}>{icon?<div className={styles.emptyIcon}>{icon}</div>:null}<h3>{title}</h3>{description?<p>{description}</p>:null}{action?<div className={styles.emptyAction}>{action}</div>:null}</div>}
