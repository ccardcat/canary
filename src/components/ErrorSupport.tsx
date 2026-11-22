import {useState} from "react";
import {Copy} from "lucide-react";
import {technicalDetails} from "../services/errors";

export function ErrorSupport({error,russian}:{error:unknown;russian:boolean}){
 const [copied,setCopied]=useState(false),[failed,setFailed]=useState(false);
 const copy=()=>{void navigator.clipboard.writeText(technicalDetails(error)).then(()=>{setCopied(true);setFailed(false);}).catch(()=>{setCopied(false);setFailed(true);});};
 return <details className="error-details"><summary>{russian?"Для поддержки":"For support"}</summary><p>{russian?"Если ошибка повторяется, скопируйте сведения и приложите их к сообщению о проблеме.":"If the error persists, copy the details and include them when reporting the problem."}</p><button type="button" className="quiet-button" onClick={copy}><Copy size={14}/>{copied?(russian?"Скопировано":"Copied"):(russian?"Копировать сведения":"Copy details")}</button>{failed&&<p role="status">{russian?"Не удалось скопировать. Проверьте доступ лаунчера к буферу обмена и повторите попытку.":"Could not copy. Check clipboard access and try again."}</p>}</details>;
}
