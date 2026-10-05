import {useState} from "react";
import {convertFileSrc} from "@tauri-apps/api/core";
export default function AccountAvatar({username,skin}:{username?:string;skin?:string}){
 const [failed,setFailed]=useState(false);const src=skin&&!/^(https?:|asset:|data:)/i.test(skin)?convertFileSrc(skin):skin;
 return <span className="account-avatar skin-avatar">{src&&!failed?<><img src={src} draggable={false} alt="" onError={()=>setFailed(true)}/><img className="skin-hat" src={src} draggable={false} alt=""/></>:<span>{username?.[0]?.toUpperCase()||"C"}</span>}</span>;
}
