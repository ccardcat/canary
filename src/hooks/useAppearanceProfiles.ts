import {useMemo,useState} from "react";
import {
  decodeAppearanceProfile, profileLimit, profileNameLimit, profileStorageKey, readAppearanceProfiles,
  type AppearanceProfile, type AppearanceSnapshot,
} from "../services/appearanceProfiles";

type Result = "saved" | "invalid" | "duplicate" | "limit" | "storage";

export function useAppearanceProfiles(current:AppearanceSnapshot,apply:(snapshot:AppearanceSnapshot)=>void) {
  const [profiles,setProfiles] = useState(readAppearanceProfiles);
  const [previous,setPrevious] = useState<AppearanceSnapshot | null>(null);
  const [lastAppliedId,setLastAppliedId] = useState<string | null>(null);
  const matchingProfiles=useMemo(()=>{
    const currentTheme=JSON.stringify(current.theme),currentVisual=JSON.stringify(current.visual);
    return profiles.filter(profile=>JSON.stringify(profile.theme)===currentTheme &&
      JSON.stringify(profile.visual)===currentVisual);
  },[current,profiles]);
  const activeId=matchingProfiles.find(profile=>profile.id===lastAppliedId)?.id ?? matchingProfiles[0]?.id ?? null;

  function save(next:AppearanceProfile[]):Result {
    try {
      localStorage.setItem(profileStorageKey,JSON.stringify(next));
      setProfiles(next);
      return "saved";
    } catch {
      return "storage";
    }
  }

  function add(name:string,snapshot:AppearanceSnapshot):Result {
    name = name.trim();
    if (!name || name.length > profileNameLimit) return "invalid";
    if (profiles.length >= profileLimit) return "limit";
    if (profiles.some(profile => profile.name.toLowerCase() === name.toLowerCase())) return "duplicate";
    return save([...profiles,{...snapshot,id:crypto.randomUUID(),name}]);
  }

  return {
    profiles, activeId, canUndo:!!previous,
    add:(name:string)=>add(name,current),
    importProfile(json:string):Result {
      const profile = decodeAppearanceProfile(json);
      return profile ? add(profile.name,profile) : "invalid";
    },
    update(id:string) {
      return save(profiles.map(profile=>profile.id===id ? {...current,id,name:profile.name} : profile));
    },
    remove(id:string) {
      const result = save(profiles.filter(profile=>profile.id!==id));
      if (result==="saved" && id===activeId) setLastAppliedId(null);
      return result;
    },
    apply(profile:AppearanceProfile) {
      setLastAppliedId(profile.id);
      if (matchingProfiles.includes(profile)) return;
      setPrevious(current);
      apply(profile);
    },
    undo() {
      if (!previous) return;
      apply(previous);
      setPrevious(null);
      setLastAppliedId(null);
    },
  };
}
