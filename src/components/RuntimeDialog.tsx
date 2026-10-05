import {useEffect,useRef,useState,type ReactNode} from "react";
import {X} from "lucide-react";
export function RuntimeDialog({title,closeLabel,onClose,children,preventClose=false}:{title:string;closeLabel:string;onClose:()=>void;children:ReactNode;preventClose?:boolean}) {
 const ref=useRef<HTMLDialogElement>(null);const [closing,setClosing]=useState(false);const close=()=>preventClose?onClose():setClosing(true);
 useEffect(()=>{const el=ref.current;const focus=document.activeElement as HTMLElement|null;el?.showModal();return()=>{el?.close();focus?.focus();};},[]);
 useEffect(()=>{if(!closing)return;const timer=setTimeout(onClose,document.documentElement.dataset.motion==="reduced"?60:180);return()=>clearTimeout(timer);},[closing,onClose]);
 return <dialog ref={ref} className={`runtime-dialog ${closing?"closing":""}`} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}} aria-label={title}><div className="runtime-heading"><h3>{title}</h3><button className="quiet-button" aria-label={closeLabel} onClick={close}><X size={18}/></button></div>{children}</dialog>;
}
