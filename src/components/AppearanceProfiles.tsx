import {useRef, useState} from "react";
import {BookmarkPlus, Check, ChevronRight, Clipboard, Download, Palette, RotateCcw, Trash2} from "lucide-react";
import type {useAppearanceProfiles} from "../hooks/useAppearanceProfiles";
import {encodeAppearanceProfile,profileJsonLimit,profileLimit,profileNameLimit,type AppearanceProfile} from "../services/appearanceProfiles";
import {accentColors} from "../services/theme";
import {useVisualAppearance} from "./VisualAppearance";
import "./Personalize.css";

export function AppearanceProfiles({russian,book}:{russian:boolean;book:ReturnType<typeof useAppearanceProfiles>}) {
  const {registry} = useVisualAppearance();
  const [name,setName] = useState("");
  const [notice,setNotice] = useState("");
  const [problem,setProblem] = useState("");
  const [removing,setRemoving] = useState<string | null>(null);
  const [transfer,setTransfer] = useState("");
  const transferPanel = useRef<HTMLDetailsElement>(null);
  const transferInput = useRef<HTMLTextAreaElement>(null);
  const text = (ru:string,en:string) => russian ? ru : en;
  const results = {
    invalid:text("Проверь имя или формат профиля.", "Check the profile name or file format."),
    duplicate:text("Такое имя уже есть. Измени имя профиля в JSON или при сохранении.", "That name already exists. Change the profile name in the JSON or when saving."),
    storage:text("Не удалось сохранить профили в хранилище лаунчера.", "Could not save profiles in launcher storage."),
    limit:text("Сохраняется до 16 оформлений. Удали одно, чтобы освободить место.", "You can save 16 looks. Remove one to make room."),
  };

  function report(result:ReturnType<typeof book.add>, success:string) {
    setNotice(result === "saved" ? success : "");
    setProblem(result === "saved" ? "" : results[result]);
    return result === "saved";
  }

  function exportProfile(profile:AppearanceProfile) {
    setTransfer(encodeAppearanceProfile(profile));
    if (transferPanel.current) transferPanel.current.open = true;
    transferInput.current?.focus();
  }

  return <section className="appearance-profile-panel">
    <div className="setting-intro"><h3>{text("Мои оформления","My looks")}</h3>
      <p>{text("Применяй сохранённые оформления здесь или через быстрый поиск Ctrl+K.",
        "Apply a saved look here or find it with Ctrl+K.")}</p>
    </div>
    <form className="appearance-profile-create" onSubmit={event=>{
      event.preventDefault();
      if (report(book.add(name),text("Оформление сохранено.", "Look saved."))) setName("");
    }}>
      <label>{text("Имя оформления","Look name")}<input value={name} onChange={event=>setName(event.target.value)}
        maxLength={profileNameLimit} placeholder={text("Например, ночной режим", "For example, Night mode")} required /></label>
      <button className="primary-button" disabled={!name.trim() || book.profiles.length>=profileLimit}><BookmarkPlus size={16}/>{text("Сохранить текущее","Save current look")}</button>
    </form>
    {book.canUndo&&<button type="button" className="quiet-button appearance-undo" onClick={()=>{
      book.undo();setProblem("");setNotice(text("Предыдущее оформление восстановлено.", "Previous look restored."));
    }}><RotateCcw size={15}/>{text("Отменить смену оформления","Undo look switch")}</button>}
    {book.profiles.length>0&&<ul className="appearance-profile-grid">
      {book.profiles.map(profile=>{
        const bg = profile.visual.backgroundSource==="canary" ? registry.find(image=>image.id===profile.visual.app) : undefined;
        const selected = book.activeId===profile.id;
        const accent = profile.theme.accent==="custom" ? profile.theme.accentColor : accentColors[profile.theme.accent];
        const fontName = (font:string) => font==="system" ? text("Системный","System font") : font;
        const fonts = profile.visual.headingFont==="inherit" || profile.visual.headingFont===profile.visual.font
          ? fontName(profile.visual.font) : `${fontName(profile.visual.font)} / ${fontName(profile.visual.headingFont)}`;
        return <li key={profile.id} className="appearance-profile-card" data-active={selected}>
          <button type="button" className="appearance-profile-select" onClick={()=>{
            book.apply(profile);setProblem("");setNotice(text("Оформление применено.", "Look applied."));
          }} aria-label={text("Применить: ","Apply look: ")+profile.name} aria-current={selected||undefined}>
            <span className="appearance-profile-preview" data-preview-mode={profile.theme.mode} aria-hidden="true">
              {bg?.thumbnail&&<img src={bg.thumbnail} loading="lazy" alt=""/>}
              <Palette size={19}/><i style={{background:accent}}/>{selected&&<Check size={18} className="appearance-profile-check"/>}
            </span>
            <span className="appearance-profile-title"><strong>{profile.name}</strong><ChevronRight size={16} aria-hidden="true"/></span>
            <small>{fonts} · {profile.visual.fontScale}%</small>
          </button>
          {removing===profile.id ? <div className="appearance-profile-actions">
            <button type="button" className="quiet-button destructive" onClick={()=>{
              if (report(book.remove(profile.id),text("Оформление удалено.", "Look removed."))) setRemoving(null);
            }}>{text("Удалить оформление","Remove look")}</button>
            <button type="button" className="quiet-button" onClick={()=>setRemoving(null)}>{text("Отмена","Cancel")}</button>
          </div> : <div className="appearance-profile-actions">
            <button type="button" className="quiet-button" onClick={()=>report(book.update(profile.id),text("Оформление обновлено.", "Look updated."))}>{text("Обновить","Update")}</button>
            <button type="button" className="quiet-button" aria-label={text("Экспорт: ","Export look: ")+profile.name} onClick={()=>exportProfile(profile)}><Download size={16}/></button>
            <button type="button" className="quiet-button" aria-label={text("Удалить: ","Remove look: ")+profile.name} onClick={()=>setRemoving(profile.id)}><Trash2 size={16}/></button>
          </div>}
        </li>;
      })}
    </ul>}
    <details className="polish-disclosure appearance-transfer" ref={transferPanel}>
      <summary>{text("Импорт и экспорт оформления","Import and export looks")}</summary>
      <p className="settings-note">{text("Отправь JSON другу или перенеси его на другой компьютер. Файлы своих обоев остаются на устройстве.",
        "Share the JSON or take it to another computer. Custom wallpaper images stay on this device.")}</p>
      <label>{text("JSON оформления","Look JSON")}<textarea ref={transferInput} value={transfer} maxLength={profileJsonLimit}
        onChange={event=>setTransfer(event.target.value)} rows={5} spellCheck={false}/></label>
      <div className="appearance-profile-actions">
        <button type="button" className="quiet-button" disabled={!transfer.trim()} onClick={()=>{
          if (report(book.importProfile(transfer),text("Оформление импортировано. Выбери его, чтобы применить.", "Look imported. Select it to apply."))) setTransfer("");
        }}>{text("Импортировать","Import look")}</button>
        <button type="button" className="quiet-button" disabled={!transfer} onClick={async()=>{
          try {
            await navigator.clipboard.writeText(transfer);
            setNotice(text("JSON скопирован.", "JSON copied."));setProblem("");
          } catch {
            transferInput.current?.select();
            setProblem(text("Буфер обмена недоступен. Скопируй выделенный текст.", "Clipboard access is unavailable. Copy the selected text."));
          }
        }}><Clipboard size={15}/>{text("Копировать JSON","Copy JSON")}</button>
      </div>
    </details>
    <p className="settings-note" role="status">{notice}</p>
    {problem&&<p className="inline-error" role="alert">{problem}</p>}
  </section>;
}
