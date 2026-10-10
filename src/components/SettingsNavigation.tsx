import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {Activity, Boxes, ChevronDown, Download, Image, Info, Library, Monitor, Palette, PanelLeft, Settings, SlidersHorizontal, Sun, UserRound, type LucideIcon} from "lucide-react";
import "./SettingsNavigation.css";

export type SettingsSection = {id:string; label:string; description:string; keywords:string; icon:LucideIcon};
export type SettingsGroup = {id:string; label:string; icon:LucideIcon; sections:SettingsSection[]};
export function settingsGroups(russian:boolean):SettingsGroup[] {
  const label=(ru:string,en:string)=>russian?ru:en;
  const section=(id:string,ru:string,en:string,descriptionRu:string,descriptionEn:string,icon:LucideIcon,keywords:string):SettingsSection=>({id,label:label(ru,en),description:label(descriptionRu,descriptionEn),icon,keywords});
  return [
    {id:"visual",label:label("Оформление","Appearance"),icon:Palette,sections:[
      section("appearance","Тема и цвета","Theme & colors","Светлая, тёмная или системная тема, палитра и акцентный цвет.","Light, dark or system theme, palette and accent color.",Palette,"theme dark light amoled accent palette тема цвет акцент палитра"),
      section("materials","Поверхности и прозрачность","Surfaces & transparency","Стиль карточек, кнопок и меню, прозрачность, размытие и скругление.","Card, button and menu styles, opacity, blur and rounded corners.",SlidersHorizontal,"material vibrancy glass opacity blur acrylic mica transparency оформление материал стекло прозрачность размытие скругление"),
      section("background","Фон","Background","Изображение или однотонный фон лаунчера и карусель на главной.","Launcher wallpaper or a solid background, and the Home carousel.",Image,"wallpaper hero rotation import фон обои главная карусель"),
      section("sidebar","Боковая панель","Sidebar","Фон, цвет, прозрачность и расположение боковой панели.","Sidebar background, color, opacity and position.",PanelLeft,"sidebar compact floating side image solid color боковая панель сайдбар однотонный картинка компактная расположение"),
      section("layout","Интерфейс и карточки","Interface & cards","Карточки библиотеки, вид каталога, плотность кнопок и видимость блоков.","Library cards, catalog layout, button density and visible interface sections.",Boxes,"catalog cards density cursor focus community popular visibility каталог карточки курсор фокус сообщество популярное"),
      section("typography","Шрифты и масштаб","Typography","Шрифт, размер интерфейса и стиль Minecraft.","Font, interface size and Minecraft typography.",SlidersHorizontal,"font typography size Monocraft шрифт масштаб размер типографика"),
      section("effects","Эффекты и анимации","Effects","Частицы, снег, сакура и уменьшение анимации.","Particles, snow, sakura and reduced animation.",Sun,"particles snow sakura autumn wind motion эффекты снег сакура листья ветер анимация движение"),
      section("window","Окно и заголовок","Window","Кнопки окна, заголовок, полноэкранный режим и системный материал.","Window controls, titlebar, fullscreen behavior and native window material.",Monitor,"titlebar branding controls F11 fullscreen maximize окно заголовок кнопки"),
      section("quality","Качество графики","Graphics quality","Баланс между визуальными эффектами и нагрузкой на компьютер.","Balance visual effects and computer performance.",SlidersHorizontal,"quality performance low balanced high качество производительность нагрузка"),
    ]},
    {id:"game",label:label("Игра и файлы","Game & files"),icon:Boxes,sections:[
      section("minecraft","Minecraft","Minecraft","Java, память, аргументы запуска и игровые настройки по умолчанию.","Java, memory, launch arguments and default game settings.",Boxes,"java memory ram arguments resolution canary игра память аргументы разрешение кенери"),
      section("downloads","Загрузки","Downloads","Параллельные загрузки и проверка обновлений сборок.","Concurrent downloads and pack update checks.",Download,"concurrency update загрузки параллельные обновления"),
      section("storage","Хранилище","Storage","Папки экземпляров, перенос файлов и очистка кэша.","Instance folders, storage migration and cache cleanup.",Library,"directory migration cache папка диск хранилище перенос кэш"),
      section("advanced","Резервные копии и логи","Backups & logs","Точки восстановления, хранение логов, импорт и экспорт игровых настроек.","Restore points, log retention, and game settings import and export.",Settings,"advanced backups restore retention reset export import дополнительные резервные логи восстановление сброс экспорт импорт"),
    ]},
    {id:"launcher",label:label("Лаунчер","Launcher"),icon:Settings,sections:[
      section("accountSettings","Аккаунты","Account","Microsoft, Ely.by и локальные профили.","Microsoft, Ely.by and local profiles.",UserRound,"accounts local профиль аккаунт вход ник"),
      section("discord","Discord","Discord","Статус игры и приватность активности в Discord.","Game status and activity privacy in Discord.",Activity,"rich presence privacy status activity приватность статус активность"),
      section("language","Язык","Language","Язык интерфейса лаунчера.","Launcher interface language.",SlidersHorizontal,"locale язык локализация"),
      section("about","О лаунчере","About","Версия Canary и информация о проекте.","Canary version and project information.",Info,"version версия информация canary кенери"),
    ]},
  ];
}

function SettingsBranch({id,expanded,children}:{id:string;expanded:boolean;children:ReactNode}) {
  const content=useRef<HTMLDivElement>(null),[height,setHeight]=useState(0);
  useLayoutEffect(()=>{const element=content.current;if(!element)return;const measure=()=>setHeight(element.getBoundingClientRect().height);measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
  return <div id={id} className="settings-branch" data-expanded={expanded} style={{height:expanded?height:0}}><div className="settings-branch-clip" aria-hidden={!expanded} inert={!expanded}><div ref={content} className="settings-children">{children}</div></div></div>;
}

export function SettingsNavigation({groups,tab,onSelect}:{groups:SettingsGroup[];tab:string;onSelect:(id:string)=>void}) {
  const activeGroup=groups.find(group=>group.sections.some(section=>section.id===tab))?.id;
  const [open,setOpen]=useState<Set<string>>(()=>new Set(activeGroup?[activeGroup]:[]));
  useEffect(()=>{if(activeGroup)setOpen(previous=>new Set(previous).add(activeGroup));},[activeGroup,tab]);
  return <>{groups.map(group=>{
    const expanded=open.has(group.id),active=group.id===activeGroup,Icon=group.icon;
    return <div className="settings-nav-group" key={group.id} data-settings-group={group.id}>
      <button type="button" className={"settings-group-toggle"+(active?" current-group":"")} aria-expanded={expanded} aria-controls={"settings-branch-"+group.id} onClick={()=>setOpen(previous=>{const next=new Set(previous);if(next.has(group.id))next.delete(group.id);else next.add(group.id);return next;})}>
        <Icon size={17}/><span>{group.label}</span><ChevronDown size={14} className="settings-group-chevron"/>
      </button>
      <SettingsBranch id={"settings-branch-"+group.id} expanded={expanded}>{group.sections.map(section=><button type="button" key={section.id} data-settings-section={section.id} className={tab===section.id?"active":""} aria-current={tab===section.id?"page":undefined} onClick={()=>onSelect(section.id)}><span>{section.label}</span></button>)}</SettingsBranch>
    </div>;
  })}</>;
}
