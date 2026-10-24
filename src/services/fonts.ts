import {convertFileSrc} from "@tauri-apps/api/core";
export type CustomFont={id:string;name:string;path:string};
export const isCustomFont=(value:string)=>/^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const customFontValue=(font:CustomFont)=>"custom:"+font.id;
export const fontFamily=(value:string)=>isCustomFont(value)?"CanaryUser-"+value.slice(7):value;
const loaded=new Map<string,Promise<FontFace>>();
export function loadCustomFont(font:CustomFont):Promise<FontFace>{
 let promise=loaded.get(font.id);
 if(!promise){
  promise=(async()=>{const response=await fetch(convertFileSrc(font.path));if(!response.ok)throw Error("Font file unavailable");const bytes=await response.arrayBuffer();if(bytes.byteLength>16*1024*1024)throw Error("Font file too large");const face=await new FontFace(fontFamily(customFontValue(font)),bytes).load();document.fonts.add(face);return face;})();
  loaded.set(font.id,promise);void promise.catch(()=>{if(loaded.get(font.id)===promise)loaded.delete(font.id);});
 }
 return promise;
}
export function unloadCustomFont(font:CustomFont){const promise=loaded.get(font.id);loaded.delete(font.id);void promise?.then(face=>document.fonts.delete(face)).catch(()=>{});}
