import {useEffect,useId,useRef,useState} from "react";
import {ArrowUpRight,Search,type LucideIcon} from "lucide-react";
import {RuntimeDialog} from "./RuntimeDialog";
import "./Personalize.css";

export type QuickResult = {
  id:string; title:string; detail?:string; keywords?:string; description?:string; icon:LucideIcon; select:()=>void;
};

const normalize = (text:string) => text.normalize("NFKC").toLowerCase();

function findResults(items:QuickResult[],query:string) {
  const text=normalize(query.trim());
  if (!text) return items.slice(0,10);
  const words=text.split(/\s+/);
  return items.flatMap(item=>{
    const title=normalize(item.title);
    const keywords=normalize(item.keywords??"");
    const searchable=[title,keywords,normalize([item.detail,item.description].join(" "))].join(" ");
    if (!words.every(word=>searchable.includes(word))) return [];
    const rank=title===text ? 0 : title.startsWith(text) ? 1 : words.every(word=>title.includes(word)) ? 2 :
      words.every(word=>keywords.includes(word)) ? 3 : 4;
    return [{item,rank}];
  }).sort((a,b)=>a.rank-b.rank).slice(0,24).map(({item})=>item);
}

export function QuickSearch({items,russian,onClose}:{items:QuickResult[];russian:boolean;onClose:()=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const listId=useId();
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState(0);
  const results=findResults(items,query);
  const active=Math.min(selected,results.length-1);
  const activeId=active>=0?`${listId}-${active}`:undefined;
  const text=(ru:string,en:string)=>russian?ru:en;

  useEffect(()=>{
    if (activeId) document.getElementById(activeId)?.scrollIntoView({block:"nearest"});
  },[activeId,query]);

  return <RuntimeDialog title={text("Быстрый поиск","Quick search")} closeLabel={text("Закрыть","Close")} onClose={onClose} initialFocus={input}>
    <form className="quick-search" onSubmit={event=>{event.preventDefault();results[active]?.select();}}>
      <label className="quick-search-field"><Search size={19} aria-hidden="true"/>
        <input ref={input} role="combobox" aria-autocomplete="list" aria-expanded="true"
          aria-controls={listId} aria-activedescendant={activeId}
          aria-label={text("Найти в Canary","Find in Canary")} placeholder={text("Сборка, страница, настройка…","Instance, page, setting…")}
          value={query} onChange={event=>{setQuery(event.target.value);setSelected(0);}} onKeyDown={event=>{
            if (event.nativeEvent.isComposing || !results.length) return;
            if (event.key==="ArrowDown" || event.key==="ArrowUp") {
              event.preventDefault();
              setSelected((active+(event.key==="ArrowDown"?1:results.length-1))%results.length);
            }
          }} />
      </label>
      <ul role="listbox" aria-label={text("Результаты","Results")} id={listId} className="quick-search-results">
        {results.map(({id,title,detail,icon:Icon,select},index)=>
          <li id={`${listId}-${index}`} role="option" aria-selected={index===active} key={id}
            onPointerDown={event=>event.preventDefault()} onClick={select}>
            <Icon size={18} aria-hidden="true"/>
            <span><strong>{title}</strong>{detail&&<small>{detail}</small>}</span>
            <ArrowUpRight size={15} aria-hidden="true"/>
          </li>
        )}
      </ul>
      {!results.length&&<p role="status" className="settings-note">{text("Ничего не найдено.", "No matching results.")}</p>}
      {results.length>0&&<p className="quick-search-keys"><kbd>↑</kbd> <kbd>↓</kbd> {text("выбрать","Select")} <kbd>Enter</kbd> {text("открыть","Open")} <kbd>Esc</kbd> {text("закрыть","Close")}</p>}
    </form>
  </RuntimeDialog>;
}
