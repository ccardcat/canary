import {useEffect, useRef, useState} from "react";
import {Blocks, Compass, Gauge, Sparkles} from "lucide-react";
import {providerInvoke} from "../services/providers";
import type {RuntimeInstance} from "../services/backend";
import {RuntimeDialog} from "./RuntimeDialog";
import {InlineError} from "./InlineError";
import "./PackComposer.css";

const recipes = [
  {id:"performance", icon:Gauge, names:["Производительность", "Performance"], mods:["sodium","lithium","ferrite-core","entityculling","modernfix","immediatelyfast"]},
  {id:"exploration", icon:Compass, names:["Исследование", "Exploration"], mods:["waystones","journeymap","natures-compass","explorers-compass","yungs-better-dungeons"]},
  {id:"building", icon:Blocks, names:["Строительство", "Building"], mods:["worldedit","litematica","chisels-and-bits","supplementaries","amendments"]},
] as const;

export type PackMod = {project:string; title:string; version:string};
type Candidate = {slug:string; status:"ready"; mod:PackMod} | {slug:string; status:"installed"|"unavailable"|"failed"; title?:string};
type Project = {id:string; title:string; slug:string; project_type:string; client_side?:string};

const aiErrors: Record<string, [string, string]> = {
  pack_chatgpt_missing:["Установите официальный Codex CLI и перезапустите Canary, чтобы команда codex была доступна.", "Install the official Codex CLI and restart Canary with codex on PATH."],
  pack_chatgpt_protocol:["Связь с Codex прервалась. Проверьте соединение и обновите Codex CLI.", "The Codex connection failed. Check your connection and update the Codex CLI."],
  pack_chatgpt_login:["Войдите в аккаунт ChatGPT в браузере и вернитесь в Canary.", "Sign in to ChatGPT in your browser, then return to Canary."],
  pack_chatgpt_browser:["Не удалось открыть браузер для входа в ChatGPT.", "Could not open your browser to sign in to ChatGPT."],
  pack_chatgpt_response:["ChatGPT не завершил подбор. Повторите запрос или выберите готовую подборку.", "ChatGPT did not finish the suggestion. Try again or choose a starter recipe."],
  pack_ai_unreachable:["Запустите Ollama на этом компьютере и повторите запрос.", "Start Ollama on this computer and try again."],
  pack_ai_model:["Модель не найдена. Проверьте имя в списке ollama list.", "Model not found. Check its name with ollama list."],
  pack_ai_timeout:["Модель не успела ответить. Повторите запрос или выберите модель поменьше.", "The model timed out. Try again or select a smaller model."],
  pack_ai_response:["Ollama не вернула список модов. Попробуйте другой запрос или модель.", "Ollama did not return a mod list. Try another prompt or model."],
  pack_ai_input:["Укажите имя модели и коротко опишите сборку.", "Enter a model name and briefly describe the pack."],
};

export function PackComposer({instance,russian,installed,locked,onClose,onReview}:{
  instance:RuntimeInstance; russian:boolean; installed:Set<string>; locked:boolean;
  onClose:()=>void; onReview:(mods:PackMod[], signal:AbortSignal)=>Promise<void>;
}) {
  const label = (ru:string, en:string) => russian ? ru : en;
  const [model,setModel] = useState("");
  const [prompt,setPrompt] = useState("");
  const [connected,setConnected] = useState<boolean | null>(null);
  const [accountAction,setAccountAction] = useState<"status"|"sign_in"|"sign_out" | null>(null);
  const [results,setResults] = useState<Candidate[] | null>(null);
  const [checked,setChecked] = useState<Set<string>>(new Set());
  const [working,setWorking] = useState<"lookup"|"review" | null>(null);
  const [error,setError] = useState<unknown>(null);
  const request = useRef<AbortController | null>(null);
  const accountRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); accountRequest.current?.abort(); }, []);

  async function changeAccount(action:"status"|"sign_in"|"sign_out") {
    if (accountRequest.current || request.current) return;
    const controller = new AbortController();
    accountRequest.current = controller;
    setAccountAction(action);
    setError(null);
    try {
      const linked = await providerInvoke<boolean>("chatgpt_account", {action}, controller.signal);
      if (!controller.signal.aborted) setConnected(linked);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason);
    } finally {
      if (accountRequest.current === controller) {
        accountRequest.current = null;
        setAccountAction(null);
      }
    }
  }

  async function lookup(source:readonly string[] | "chatgpt" | "ollama") {
    if (request.current || accountRequest.current || locked) return;
    const controller = new AbortController();
    request.current = controller;
    const {signal} = controller;
    setWorking("lookup");
    setError(null);
    setResults(null);
    try {
      const suggestions = typeof source === "string" ?
        await providerInvoke<string[]>("suggest_pack_mods", {
          id:instance.id, engine:source, prompt:prompt.trim(), ...(source === "ollama" ? {model:model.trim()} : {}),
        }, signal) : source;
      const wanted = [...new Set(suggestions)].filter(slug => /^[a-z0-9][a-z0-9_-]{1,63}$/.test(slug)).slice(0, 8);
      const rows = await Promise.all(wanted.map(async (slug):Promise<Candidate> => {
        try {
          const provider = "modrinth";
          const project = await providerInvoke<Project>("content_project", {project:slug, provider}, signal);
          if (project?.slug !== slug || project.project_type !== "mod" || project.client_side === "unsupported")
            return {slug,status:"unavailable"};
          if (installed.has(project.id)) return {slug,status:"installed",title:project.title};
          const [version] = await providerInvoke<{id:string}[]>("content_versions", {id:instance.id, project:project.id, kind:"mod", beta:false, provider}, signal);
          return version ? {slug,status:"ready",mod:{project:project.id,title:project.title,version:version.id}} :
            {slug,status:"unavailable",title:project.title};
        } catch {
          return {slug,status:"failed"};
        }
      }));
      if (!signal.aborted) {
        setResults(rows);
        setChecked(new Set(rows.filter(row => row.status === "ready").map(row => row.slug)));
      }
    } catch (reason) {
      if (!signal.aborted) setError(reason);
    } finally {
      request.current = null;
      if (!signal.aborted) setWorking(null);
    }
  }

  const selected = (results ?? []).flatMap(row => row.status === "ready" && checked.has(row.slug) && !installed.has(row.mod.project) ? [row.mod] : []);
  async function review() {
    if (request.current || locked || !selected.length) return;
    const controller = new AbortController();
    request.current = controller;
    setWorking("review");
    setError(null);
    try {
      await onReview(selected, controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setWorking(null);
    }
  }

  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const aiError = aiErrors[code];
  return <RuntimeDialog title={label("Конструктор сборок","Pack builder")} closeLabel={label("Закрыть","Close")} onClose={onClose}>
    <div className="pack-composer">
      <p><strong>{instance.name}</strong> · Minecraft {instance.minecraft} · {instance.loader}</p>
      <div className="pack-recipes" role="group" aria-label={label("Готовые подборки","Starter recipes")}>
        {recipes.map(({id,icon:Icon,names,mods}) => <button key={id} type="button" className="quiet-button" disabled={!!working || !!accountAction || locked} onClick={() => void lookup(mods)}><Icon size={17}/>{names[russian ? 0 : 1]}</button>)}
      </div>
      <details className="polish-disclosure" onToggle={event => {
        if (event.currentTarget.open && connected === null) void changeAccount("status");
      }}>
        <summary>{label("Подобрать с помощью ChatGPT","Suggest with ChatGPT")}</summary>
        <p className="settings-note">{label("Вход открывается в системном браузере через официальный Codex CLI. ChatGPT получает ваш запрос, версию Minecraft и загрузчик.", "Sign-in opens in your browser through the official Codex CLI. ChatGPT receives your prompt, Minecraft version, and loader.")}</p>
        <div className="runtime-inline pack-account">
          {connected === true && <b role="status">{label("ChatGPT подключён","ChatGPT connected")}</b>}
          {accountAction === "sign_in" && <span role="status">{label("Завершите вход в браузере…","Finish signing in in your browser…")}</span>}
          {accountAction === "status" && <span role="status">{label("Проверяем подключение…","Checking connection…")}</span>}
          {accountAction === "sign_in" ?
            <button type="button" className="quiet-button" onClick={() => accountRequest.current?.abort()}>{label("Отменить вход","Cancel sign-in")}</button> :
            <button type="button" className="quiet-button" disabled={!!accountAction || !!working} onClick={() => void changeAccount(connected ? "sign_out" : "sign_in")}>
              {connected ? label("Отключить ChatGPT","Disconnect ChatGPT") : label("Войти в ChatGPT","Sign in to ChatGPT")}
            </button>}
        </div>
        {connected === true && <form className="pack-prompt" onSubmit={event => { event.preventDefault(); void lookup("chatgpt"); }}>
          <label>{label("Опишите сборку для ChatGPT","Describe your pack to ChatGPT")}<textarea required rows={3} maxLength={600} value={prompt} onChange={event => setPrompt(event.target.value)}/></label>
          <button className="quiet-button" disabled={!!working || !!accountAction || locked || !prompt.trim()}><Sparkles size={16}/>{label("Подобрать через ChatGPT","Suggest with ChatGPT")}</button>
        </form>}
      </details>
      <details className="polish-disclosure">
        <summary>{label("Подобрать с помощью Ollama","Suggest with Ollama")}</summary>
        <p className="settings-note">{label("Запустите Ollama с установленной моделью. Canary передаст ей ваш запрос, версию Minecraft и загрузчик.", "Start Ollama with an installed model. Canary sends it your request, Minecraft version, and loader.")}</p>
        <form className="pack-prompt" onSubmit={event => { event.preventDefault(); void lookup("ollama"); }}>
          <label>{label("Модель Ollama","Ollama model")}<input required value={model} maxLength={100} placeholder="qwen2.5:3b" onChange={event => setModel(event.target.value)} /></label>
          <label>{label("Какую сборку хотите?","What kind of pack?")}<textarea required rows={3} maxLength={600} value={prompt} placeholder={label("Уютное выживание с фермами и новым декором", "Cozy survival with farming and new decorations")} onChange={event => setPrompt(event.target.value)}/></label>
          <button className="quiet-button" disabled={!!working || !!accountAction || locked || !model.trim() || !prompt.trim()}><Sparkles size={16}/>{label("Подобрать моды","Suggest mods")}</button>
        </form>
      </details>
      {working && <p role="status">{working === "review" ? label("Проверяем зависимости…","Checking dependencies…") : label("Подбираем и проверяем моды…","Looking up and checking mods…")}</p>}
      {error != null && (aiError ? <p className="inline-error" role="alert">{aiError[russian ? 0 : 1]}</p> : <InlineError error={error} russian={russian}/>)}
      {results && <section className="pack-results">
        <h4>{label("Проекты Modrinth","Modrinth projects")}</h4>
        {results.length === 0 && <p>{label("Предложений нет. Попробуйте другую подборку или запрос.", "No suggestions. Try another recipe or prompt.")}</p>}
        {results.map(row => row.status === "ready" && !installed.has(row.mod.project) ?
          <label key={row.slug}><input type="checkbox" checked={checked.has(row.slug)} disabled={!!working || locked} onChange={event => {
            setChecked(old => { const next = new Set(old); if (event.target.checked) next.add(row.slug); else next.delete(row.slug); return next; });
          }}/><span>{row.mod.title}</span></label> :
          <p key={row.slug}><span>{row.status === "ready" ? row.mod.title : row.title ?? row.slug}</span><small>{row.status === "installed" || row.status === "ready" ? label("Уже установлен","Already installed") : row.status === "unavailable" ? label("Нет подходящего релиза","No compatible release") : label("Не удалось проверить","Could not verify")}</small></p>)}
        <button className="compact-action" type="button" disabled={!!working || locked || !selected.length} onClick={() => void review()}>{label("Проверить план установки","Review install plan")} ({selected.length})</button>
      </section>}
    </div>
  </RuntimeDialog>;
}
