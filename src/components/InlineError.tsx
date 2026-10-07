import {useState} from "react";
import {errorCopy,technicalDetails} from "../services/errors";
export function InlineError({error,russian}:{error:unknown;russian:boolean}){
 const {title,message,hint,detail}=errorCopy(error,russian);const [copied,setCopied]=useState(false);
 return <div className="inline-error" role="alert"><b>{title}</b><p>{message}</p><p className="settings-note">{hint}</p><details className="error-details"><summary>{russian?"Подробнее":"Details"}</summary><dl><div><dt>{russian?"Код":"Code"}</dt><dd>{detail.code}</dd></div>{detail.stage&&<div><dt>{russian?"Этап":"Stage"}</dt><dd>{detail.stage}</dd></div>}</dl>{detail.message&&<p className="error-technical-message selectable">{detail.message}</p>}<button type="button" className="quiet-button" onClick={()=>void navigator.clipboard.writeText(technicalDetails(error)).then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?(russian?"Скопировано":"Copied"):(russian?"Копировать сведения":"Copy details")}</button></details></div>;
}
