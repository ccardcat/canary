use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};
use std::{fs, io::Read, path::{Path, PathBuf}};
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;
#[derive(Clone,Serialize)] struct Progress { stage:String, file:String, completed:u64, total:u64, downloaded:u64, bytes_total:u64, percent:f64 }
#[derive(Deserialize)] struct Index { name:String, #[serde(rename="versionId")] version_id:String, files:Vec<FileEntry>, overrides:Option<String>, #[serde(rename="client-overrides")] client_overrides:Option<String>, dependencies:serde_json::Value }
#[derive(Deserialize)] struct FileEntry { path:String, hashes:Option<std::collections::HashMap<String,String>>, downloads:Vec<String>, file_size:Option<u64> }
fn emit(a:&AppHandle,p:Progress){let _=a.emit("install-progress",p);}
fn safe(base:&Path, rel:&str)->Result<PathBuf,String>{let p=Path::new(rel);if p.is_absolute()||rel.contains("..") {return Err("Unsafe archive path".into())}Ok(base.join(p))}
#[tauri::command]
async fn install_modpack(app:AppHandle, project_id:String, version_id:String, name:String)->Result<String,String>{
 emit(&app,Progress{stage:"Fetching version".into(),file:"".into(),completed:0,total:0,downloaded:0,bytes_total:0,percent:0.0});
 let c=reqwest::Client::new();
 let ver:serde_json::Value=c.get(format!("https://api.modrinth.com/v2/version/{version_id}")).send().await.map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
 let file=ver["files"].as_array().and_then(|x|x.first()).ok_or("No mrpack file")?; let url=file["url"].as_str().ok_or("Missing download URL")?;
 let data=c.get(url).send().await.map_err(|e|e.to_string())?.bytes().await.map_err(|e|e.to_string())?;
 emit(&app,Progress{stage:"Reading manifest".into(),file:"modrinth.index.json".into(),completed:0,total:1,downloaded:data.len() as u64,bytes_total:data.len() as u64,percent:10.0});
 let mut z=ZipArchive::new(std::io::Cursor::new(data)).map_err(|e|e.to_string())?; let mut raw=String::new(); z.by_name("modrinth.index.json").map_err(|e|e.to_string())?.read_to_string(&mut raw).map_err(|e|e.to_string())?; let idx:Index=serde_json::from_str(&raw).map_err(|e|e.to_string())?;
 let root=dirs::data_local_dir().ok_or("No app data dir")?.join("Whatscord Data").join("instances").join(format!("{}-{}",project_id,version_id)); fs::create_dir_all(&root).map_err(|e|e.to_string())?;
 let total=idx.files.len() as u64; let mut done=0; let mut bytes=0; for f in idx.files {let out=safe(&root,&f.path)?;if let Some(parent)=out.parent(){fs::create_dir_all(parent).map_err(|e|e.to_string())?};let resp=c.get(f.downloads.first().ok_or("Missing file URL")?).send().await.map_err(|e|e.to_string())?;let b=resp.bytes().await.map_err(|e|e.to_string())?;if let Some(h)=f.hashes.as_ref().and_then(|h|h.get("sha512")){let mut hasher=Sha512::new();hasher.update(&b);if format!("{:x}",hasher.finalize())!=*h{return Err(format!("Hash mismatch: {}",f.path));}}fs::write(&out,&b).map_err(|e|e.to_string())?;done+=1;bytes+=b.len() as u64;emit(&app,Progress{stage:"Downloading files".into(),file:f.path,completed:done,total,downloaded:bytes,bytes_total:0,percent:10.0+80.0*(done as f64/total.max(1) as f64)});}
 for prefix in ["overrides/","client-overrides/"] {let names:Vec<String>=(0..z.len()).filter_map(|i|z.by_index(i).ok().map(|x|x.name().to_string())).filter(|n|n.starts_with(prefix)).collect();for n in names{let rel=n.trim_start_matches(prefix);let out=safe(&root,rel)?;if let Some(p)=out.parent(){fs::create_dir_all(p).map_err(|e|e.to_string())?};let mut f=z.by_name(&n).map_err(|e|e.to_string())?;let mut b=Vec::new();f.read_to_end(&mut b).map_err(|e|e.to_string())?;fs::write(out,b).map_err(|e|e.to_string())?;}}
 let meta=serde_json::json!({"project_id":project_id,"version_id":version_id,"name":name,"instance_path":root});fs::write(root.join("whatscord-instance.json"),serde_json::to_vec_pretty(&meta).unwrap()).map_err(|e|e.to_string())?;emit(&app,Progress{stage:"Complete".into(),file:"".into(),completed:total,total,downloaded:bytes,bytes_total:bytes,percent:100.0});Ok(root.to_string_lossy().to_string())}
#[cfg_attr(mobile,tauri::mobile_entry_point)] pub fn run(){tauri::Builder::default().plugin(tauri_plugin_opener::init()).invoke_handler(tauri::generate_handler![install_modpack]).run(tauri::generate_context!()).expect("error while running tauri application");}


