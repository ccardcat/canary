import {useCallback,useEffect,useState} from "react";
import {isTauri} from "@tauri-apps/api/core";
import {Check,Download,ExternalLink,Plus,RefreshCw,Shirt,Trash2} from "lucide-react";
import {defaultAccount,useBackend} from "../services/backend";
import {externalLink} from "../services/links";
import GlassSelect from "./GlassSelect";
import {SkinPreview} from "./SkinPreview";
import "./CollectionTools.css";
import "./SkinsPage.css";

type Skin={id:string;name:string;model:"classic"|"slim";legacy:boolean;preview:string};
type AccountSkin=Omit<Skin,"id"|"name">&{account_id:string;provider:string};
export function SkinsPage({russian}:{russian:boolean}){
 const {run,snapshot}=useBackend();
 const text=(ru:string,en:string)=>russian?ru:en;
 const active=defaultAccount(snapshot);
 const [accountId,setAccountId]=useState("");
 const [current,setCurrent]=useState<AccountSkin|null>(null);
 const [loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
 const [skins,setSkins]=useState<Skin[]>([]),[selectedId,setSelectedId]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[remove,setRemove]=useState(false);
 const account=snapshot?.accounts.find(a=>a.id===accountId);
 const skin=skins.find(s=>s.id===selectedId);
 const refresh=useCallback(async()=>{const value=await run<Skin[]>("list_skins");setSkins(value??[]);},[run]);
 useEffect(()=>{setAccountId(active&&["microsoft","elyby"].includes(active.provider)?active.id:"");},[active?.id,active?.provider]);
 useEffect(()=>{void refresh().catch(()=>{});},[refresh]);
 useEffect(()=>{
  let live=true;setCurrent(null);setFailed(false);
  if(!accountId){setLoading(false);return;}
  setLoading(true);
  void run<AccountSkin|null>("get_account_skin",{accountId},{reportError:false}).then(value=>{if(live)setCurrent(value);}).catch(()=>{if(live)setFailed(true);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[accountId,revision,run]);
 const act=async(fn:()=>Promise<void>)=>{setBusy(true);setNotice("");try{await fn();}catch{}finally{setBusy(false);}};
 if(!isTauri())return <section className="skins-page"><p className="settings-note">{text("Открой Canary в приложении, чтобы управлять скинами аккаунтов.","Open the Canary desktop app to manage account skins.")}</p></section>;
 return <section className="skins-page">
  <p className="skins-intro">{text("Твой скин из Microsoft или Ely.by и сохранённая коллекция — в одном месте.","Your Microsoft or Ely.by skin and saved collection, in one place.")}</p>
  <div className="skin-account-bar"><label>{text("Аккаунт","Account")}<GlassSelect aria-label={text("Аккаунт для скинов","Skin account")} value={accountId} disabled={busy} onChange={e=>{setAccountId(e.target.value);setRemove(false);setNotice("");}}>
   <option value="">{text("Выбери Microsoft или Ely.by","Choose Microsoft or Ely.by")}</option>
   {snapshot?.accounts.filter(a=>["microsoft","elyby"].includes(a.provider)).map(a=><option key={a.id} value={a.id}>{a.username} · {a.provider==="microsoft"?"Microsoft":"Ely.by"}</option>)}
  </GlassSelect></label>{account&&<button className="quiet-button" disabled={loading||busy} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={16}/>{text("Обновить скин","Refresh skin")}</button>}</div>
  <article className="skin-account-card">
   <div className="skin-account-preview">{current?<SkinPreview key={current.account_id+current.preview} src={current.preview} slim={current.model==="slim"} legacy={current.legacy} russian={russian}/>:<div className="skin-empty-preview"><Shirt size={52}/><span>{loading?text("Загружаем скин…","Loading skin…"):text("Скин аккаунта","Account skin")}</span></div>}</div>
   <div className="skin-account-copy"><small>{text("Текущий скин","Current skin")}</small><h2>{account?.username??text("Выбери аккаунт","Choose an account")}</h2>
    {account?<><p className="settings-note">{text("Источник","Source")}: <b>{account.provider==="microsoft"?"Microsoft / Minecraft":"Ely.by"}</b>{current&&` · ${current.model==="slim"?"Slim":"Classic"}`}</p>
    {failed?<p role="alert">{text("Не удалось получить скин выбранного аккаунта. Повтори обновление.","Could not load this account's skin. Try refreshing it.")}</p>:!loading&&!current&&<p className="settings-note">{text("У этого профиля нет доступной текстуры скина.","This profile has no available skin texture.")}</p>}
    <button className="quiet-button" disabled={!current||loading||busy} onClick={()=>void act(async()=>{const saved=await run<Skin>("save_account_skin",{accountId});await refresh();setSelectedId(saved.id);setNotice(text("Скин аккаунта сохранён в коллекцию","Account skin saved to your collection"));})}><Download size={16}/>{text("Сохранить в мои скины","Save to my skins")}</button>
    {account.provider==="elyby"&&<><p className="settings-note">{text("Скин Ely.by меняется в профиле Ely.by. После смены нажми «Обновить скин».","Change your Ely.by skin on Ely.by, then refresh it here.")}</p><button className="quiet-button" onClick={()=>void externalLink("https://ely.by/skins")}><ExternalLink size={16}/>{text("Открыть Ely.by","Open Ely.by")}</button></>}</>:<p className="settings-note">{text("Войди через Microsoft или Ely.by в меню аккаунта. Локальному профилю сетевой скин не назначается.","Sign in with Microsoft or Ely.by in the account menu. Local profiles have no online skin.")}</p>}
   </div>
  </article>
  <section className="skin-library"><div className="runtime-heading"><h3>{text("Мои скины","My skins")}</h3><button className="quiet-button" disabled={busy} onClick={()=>void act(async()=>{const value=await run<Skin|null>("import_skin");if(value){await refresh();setSelectedId(value.id);setRemove(false);}})}><Plus size={16}/>{text("Добавить PNG","Add PNG")}</button></div>
   <div className="skin-library-layout"><div className="skin-library-list">{!skins.length&&<p className="settings-note">{text("Сохрани скин аккаунта или добавь PNG 64 × 64 / 64 × 32.","Save your account skin or add a 64 × 64 / 64 × 32 PNG.")}</p>}{skins.map(s=><button className="quiet-button skin-entry" disabled={busy} key={s.id} aria-pressed={s.id===selectedId} onClick={()=>{setSelectedId(s.id);setNotice("");setRemove(false);}}><span className="skin-face" style={{backgroundImage:`url(${s.preview})`}}/><span>{s.name}<small>{s.model==="slim"?"Slim":"Classic"}</small></span></button>)}</div>
   {skin&&<div className="skin-selected"><SkinPreview src={skin.preview} slim={skin.model==="slim"} legacy={skin.legacy} russian={russian}/>
    <label>{text("Модель","Model")}<GlassSelect aria-label={text("Модель","Model")} disabled={busy||skin.legacy} value={skin.model} onChange={e=>void act(async()=>{await run("edit_skin",{id:skin.id,name:skin.name,model:e.target.value});await refresh();})}><option value="classic">Classic</option><option value="slim">Slim</option></GlassSelect></label>
    <div className="runtime-inline">{account?.provider==="microsoft"?<button className="primary-button" disabled={busy} onClick={()=>void act(async()=>{await run("apply_skin",{id:skin.id,accountId});setRevision(n=>n+1);setNotice(text("Скин отправлен в Microsoft. Перезапусти Minecraft, чтобы увидеть его в игре.","Skin uploaded to Microsoft. Restart Minecraft to see it in game."));})}><Check size={16}/>{text("Применить скин","Apply skin")}</button>:<p className="settings-note">{text("Для загрузки этого PNG в Minecraft выбери Microsoft аккаунт. Скин Ely.by меняется на сайте провайдера.","Select a Microsoft account to upload this PNG to Minecraft. Ely.by skins are changed on the provider's site.")}</p>}
    <button className="quiet-button destructive" disabled={busy} onClick={()=>setRemove(true)}><Trash2 size={16}/>{text("Удалить","Remove")}</button></div>
    {remove&&<div className="collection-restore-confirm"><p>{text("Удалить сохранённый скин? Скин аккаунта останется прежним.","Remove this saved skin? Your account skin stays as it is.")}</p><div className="runtime-inline"><button className="quiet-button destructive" disabled={busy} onClick={()=>void act(async()=>{await run("remove_skin",{id:skin.id});await refresh();setSelectedId("");setRemove(false);})}>{text("Удалить","Remove")}</button><button className="quiet-button" disabled={busy} onClick={()=>setRemove(false)}>{text("Отмена","Cancel")}</button></div></div>}
   </div>}</div>
  </section>
  {notice&&<p role="status" className="collection-notice"><Check size={16}/>{notice}</p>}
 </section>;
}
