type Problem = {reason?:unknown;name?:unknown;required?:unknown;actual?:unknown;dependency?:unknown;other?:unknown};
const value=(text:unknown)=>typeof text==="string"?text:"";
const loader=(text:string)=>text.replace(/\b(fabricloader|quilt_loader|fabric|quilt|neoforge|forge|vanilla)\b/gi,name=>({fabricloader:"Fabric Loader",quilt_loader:"Quilt Loader",fabric:"Fabric",quilt:"Quilt",neoforge:"NeoForge",forge:"Forge",vanilla:"Vanilla"})[name.toLowerCase()]||name);
export function contentErrorCopy(context:unknown,russian:boolean){
 if(!context||typeof context!=="object")return null;
 const p=context as Problem,reason=value(p.reason),name=value(p.name)||(russian?"Выбранный мод":"Selected mod"),required=loader(value(p.required)),actual=loader(value(p.actual)),dependency=loader(value(p.dependency)),other=value(p.other)||dependency;
 let message:string,hint:string;
 switch(reason){
  case "no_release":message=russian?`Для «${name}» нет ${required==="stable"?"стабильного ":""}релиза под ${actual}.`:`${name} has no ${required==="stable"?"stable ":""}release for ${actual}.`;hint=russian?`Выберите другой мод или поддерживаемую версию экземпляра.${required==="stable"?" Если автор выпустил совместимую beta/alpha-версию, включите их показ.":""}`:`Choose another mod or a supported instance version.${required==="stable"?" Enable beta/alpha releases if the author provides a compatible one.":""}`;break;
  case "minecraft":message=russian?`«${name}» требует ${required.startsWith("minecraft ")?required.replace(/^minecraft /,"Minecraft "):"Minecraft "+required}. В экземпляре: ${actual}.`:`${name} requires ${required.startsWith("minecraft ")?required:"Minecraft "+required}; this instance uses ${actual}.`;hint=russian?"Установите версию мода для этого Minecraft или выберите подходящий экземпляр.":"Install a mod release for this Minecraft version or choose a matching instance.";break;
  case "loader":case "loader_version":message=russian?`«${name}» требует ${required}. В экземпляре: ${actual}.`:`${name} requires ${required}; this instance uses ${actual}.`;hint=russian?"Выберите файл для своего загрузчика. Если нужна другая версия загрузчика, обновите её в настройках экземпляра.":"Choose a file for your loader, or update the loader version in instance settings.";break;
  case "server_only":message=russian?`«${name}» предназначен только для сервера и не подходит для клиентского экземпляра.`:`${name} is a server-only mod and cannot run in this client instance.`;hint=russian?"Выберите клиентскую версию мода.":"Choose a client-compatible mod.";break;
  case "dependency_missing":message=russian?`Для «${name}» нужен ${dependency} ${required}. Этот мод не установлен или выключен.`:`${name} requires ${dependency} ${required}. The dependency is missing or disabled.`;hint=russian?"Добавьте или включите нужную зависимость. При импорте можно выбрать мод и его зависимости вместе.":"Add or enable the dependency. You can import the mod and its dependencies together.";break;
  case "dependency_version":message=russian?`«${name}» требует ${dependency} ${required}, но установлено: «${other}» ${actual}.`:`${name} requires ${dependency} ${required}; installed: ${other} ${actual}.`;hint=russian?"Выберите совместимые версии обоих модов и обновите их вместе.":"Choose compatible releases of both mods and update them together.";break;
  case "conflict":case "duplicate":message=russian?`«${name}» ${reason==="duplicate"?"дублирует":"конфликтует с"} «${other}»${actual?" "+actual:""}${dependency?" ("+dependency+")":""}.`:`${name} ${reason==="duplicate"?"duplicates":"conflicts with"} ${other}${actual?" "+actual:""}${dependency?" ("+dependency+")":""}.`;hint=russian?"Оставьте один из модов или выберите версии, которые совместимы между собой. Текущие файлы не изменены.":"Keep one mod or choose compatible releases. Existing files were not changed.";break;
  default:return null;
 }
 return {title:russian?"Не удалось добавить мод":"Could not add mod",message,hint};
}

// Translate only facts explicitly reported by the loader. An exit code or an
// unfamiliar message cannot identify a conflicting mod or required version.
export function runtimeContentCopy(message:string,russian:boolean){
 const problems:string[]=[];
 for(const line of message.split(/\r?\n/).slice(0,24)){
  const named=line.match(/Mod ['"]([^'"]+)['"](?: \([^)]*\))?(?: [\w.+-]+)? requires (.+?) of mod ['"]([^'"]+)['"](?: \([^)]*\))?,? (?:but|which) (.+)/i);
  const simple=line.match(/\bMod (.+?) requires (.+?) ([\w.<>~=+-]+);? (?:but )?only ([\w.+-]+) is present/i);
  if(named){
   const [,name,required,dependency,tail]=named;const actual=tail.match(/only (?:the wrong version[s]?:? )?([\w.+-]+) (?:is|are) present/i)?.[1];
   if(actual||/missing|not installed/i.test(tail)){
    const requirement=required.replace(/^version /i,"").replace(/^any version$/i,russian?"любая версия":"any version");
    const copy=contentErrorCopy({reason:actual?"dependency_version":"dependency_missing",name,dependency,required:russian?requirement.replace(/or later/gi,"или новее").replace(/or newer/gi,"или новее").replace(/or above/gi,"или выше"):requirement,other:dependency,actual},russian);
    if(copy)problems.push(copy.message);
   }
  }else if(simple){const [,name,dependency,required,actual]=simple;const copy=contentErrorCopy({reason:"dependency_version",name,dependency,required,actual,other:dependency},russian);if(copy)problems.push(copy.message);}
  const conflict=line.match(/\bMod ['"]([^'"]+)['"].*?(?:is incompatible with|conflicts with).*?mod ['"]([^'"]+)['"]/i);
  if(conflict){const copy=contentErrorCopy({reason:"conflict",name:conflict[1],other:conflict[2]},russian);if(copy)problems.push(copy.message);}
 }
 return {title:russian?"Моды не могут загрузиться":"Mods could not load",message:problems.length?[...new Set(problems)].join("\n"):russian?"Загрузчик сообщил о несовместимости модов, но не передал причину в распознаваемом формате.":message,hint:russian?problems.length?"Установите совместимые версии указанных модов и зависимостей или отключите конфликтующий мод.":"Откройте логи игры, найдите сообщение загрузчика о несовместимости и проверьте указанные там моды. Сведения можно скопировать для поддержки.":"Install compatible versions of the reported mods and dependencies, or disable the conflicting mod. Check Game Logs if no exact cause is shown."};
}
