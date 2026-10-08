import {useEffect,useState} from "react";
import {convertFileSrc} from "@tauri-apps/api/core";
export default function AccountAvatar({skin}:{username?:string;skin?:string}){
 const [failed,setFailed]=useState(false);const src=skin&&!/^(https?:|asset:|data:)/i.test(skin)?convertFileSrc(skin):skin;
 useEffect(()=>setFailed(false),[src]);
 return <span className="account-avatar skin-avatar">{src&&!failed?<><img src={src} draggable={false} alt="" onError={()=>setFailed(true)}/><img className="skin-hat" src={src} draggable={false} alt=""/></>:<svg className="default-skin-head" viewBox="0 0 8 8" aria-hidden="true" shapeRendering="crispEdges"><path fill="#a87855" d="M0 0h8v8H0z"/><path fill="#463127" d="M0 0h8v2H0zM0 2h1v1H0zM7 2h1v1H7z"/><path fill="#ded6ca" d="M1 4h2v1H1zM5 4h2v1H5z"/><path fill="#566098" d="M2 4h1v1H2zM5 4h1v1H5z"/><path fill="#8b5742" d="M3 5h2v1H3z"/><path fill="#493025" d="M2 6h1v1H2zM5 6h1v1H5zM2 7h4v1H2z"/></svg>}</span>;
}
