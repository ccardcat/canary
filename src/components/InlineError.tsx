import {errorCopy} from "../services/errors";
import {ErrorSupport} from "./ErrorSupport";
export function InlineError({error,russian}:{error:unknown;russian:boolean}){
 const {title,message,hint}=errorCopy(error,russian);
 return <div className="inline-error" role="alert"><b>{title}</b><h4 className="error-section-label">{russian?"Почему возникла ошибка":"Why it happened"}</h4><p>{message}</p><h4 className="error-section-label">{russian?"Как исправить":"How to fix it"}</h4><p className="settings-note">{hint}</p><ErrorSupport error={error} russian={russian}/></div>;
}
