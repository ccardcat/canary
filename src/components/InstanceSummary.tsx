import {useState} from "react";
import {Copy} from "lucide-react";
import type {RuntimeInstance} from "../services/backend";

export function InstanceSummary({instance,russian}: {instance:RuntimeInstance; russian:boolean}) {
  const [result,setResult] = useState<"copied"|"manual"|null>(null);
  const text=(ru:string,en:string)=>russian?ru:en;
  const label=text("Сводка сборки","Instance summary");
  const loader=[instance.loader,instance.loader_version].filter(Boolean).join(" ");
  const summary=[
    `${text("Сборка","Instance")}: ${instance.name}`,
    `Minecraft: ${instance.minecraft}`,
    loader && `${text("Загрузчик","Loader")}: ${loader}`,
    instance.version_name && `${text("Версия сборки","Pack release")}: ${instance.version_name}`,
  ].filter(Boolean).join("\n");

  return <details className="instance-summary">
    <summary>{label}</summary>
    <textarea aria-label={label} value={summary} rows={4} readOnly spellCheck={false}/>
    <button type="button" className="quiet-button" onClick={async()=>{
      try {
        await navigator.clipboard.writeText(summary);
        setResult("copied");
      } catch {
        setResult("manual");
      }
    }}><Copy size={15}/>{text("Копировать сводку","Copy summary")}</button>
    {result&&<p className="settings-note" role="status">{result==="copied"?text("Сводка скопирована.","Summary copied."):text("Выдели и скопируй текст из поля выше.","Select and copy the text above.")}</p>}
  </details>;
}
