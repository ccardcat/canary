import {useState} from "react";
import {isTauri} from "@tauri-apps/api/core";
import {Plus,Trash2} from "lucide-react";
import {useBackend} from "../services/backend";
import {customFontValue,loadCustomFont,unloadCustomFont,type CustomFont} from "../services/fonts";
import {useVisualAppearance} from "./VisualAppearance";
import "./CustomFonts.css";

export function CustomFonts({russian}:{russian:boolean}){
 const {run}=useBackend();const {value,update,customFonts,reloadFonts,fontLoadFailed}=useVisualAppearance();
 const [busy,setBusy]=useState(false),[error,setError]=useState(false);
 const text=(ru:string,en:string)=>russian?ru:en;
 const apply=async(font:CustomFont)=>{await loadCustomFont(font);update({font:customFontValue(font)});};
 const act=async(action:()=>Promise<void>)=>{setBusy(true);setError(false);try{await action();}catch{setError(true);}finally{setBusy(false);}};
 if(!isTauri())return null;
 return <div className="custom-font-library"><h4>{text("Свои шрифты","Custom fonts")}</h4>
  <p className="settings-note">{text("Добавь файл .ttf или .otf. Шрифт сохраняется в Canary и применяется ко всему интерфейсу.","Add a .ttf or .otf file. Canary keeps a copy and applies it across the interface.")}</p>
  <div className="custom-font-list">{customFonts.map(font=><div className="custom-font-row" key={font.id}>
   <button type="button" className="quiet-button" disabled={busy} aria-pressed={value.font===customFontValue(font)} onClick={()=>void act(()=>apply(font))}>{font.name}</button>
   <button type="button" className="material-icon" disabled={busy} aria-label={text("Удалить шрифт ","Remove font ")+font.name} onClick={()=>void act(async()=>{await run("remove_font",{id:font.id});if(value.font===customFontValue(font))update({font:"Nunito"});unloadCustomFont(font);await reloadFonts();})}><Trash2 size={16}/></button>
  </div>)}</div>
  <button type="button" className="quiet-button" disabled={busy} onClick={()=>void act(async()=>{const font=await run<CustomFont|null>("import_font");if(font){await reloadFonts();await apply(font);}})}><Plus size={16}/>{busy?text("Загрузка…","Loading…"):text("Добавить шрифт","Add font")}</button>
  {(error||fontLoadFailed)&&<p role="alert" className="settings-note">{text("Не удалось загрузить шрифт. Выбери другой файл .ttf или .otf; встроенные шрифты остаются доступны.","Could not load this font. Choose another .ttf or .otf file; built-in fonts remain available.")}</p>}
 </div>;
}
