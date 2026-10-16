use super::{Backend,model::*,protected_fs as fs,storage};
use base64::Engine;
use serde::{Deserialize,Serialize};
use std::{path::PathBuf,sync::Arc};
use tauri::{AppHandle,State};
#[derive(Clone,Serialize,Deserialize)]pub struct Skin{pub id:String,pub name:String,pub model:String,#[serde(default)]pub legacy:bool,#[serde(skip_deserializing,default)]pub preview:String}
fn folder(b:&Backend)->PathBuf{b.root.join("skins")}
fn validate_id(id:&str)->Result<()>{uuid::Uuid::parse_str(id).map_err(|_|BackendError::new("skin","Invalid skin identity"))?;Ok(())}
fn validate_model(model:&str)->Result<()>{if !matches!(model,"classic"|"slim"){return Err(BackendError::new("skin","Choose Classic or Slim"));}Ok(())}
pub fn normalize(bytes:&[u8])->Result<(Vec<u8>,bool)>{
    if bytes.len()>1024*1024||!bytes.starts_with(b"\x89PNG\r\n\x1a\n"){return Err(BackendError::new("skin","Choose a PNG skin of up to 1 MiB"));}
    let reader=image::ImageReader::with_format(std::io::Cursor::new(bytes),image::ImageFormat::Png);let dimensions=reader.into_dimensions().map_err(|_|BackendError::new("skin","Cannot read this PNG"))?;
    if !matches!(dimensions,(64,64)|(64,32)){return Err(BackendError::new("skin","Skin dimensions must be 64 × 64 or 64 × 32"));}
    let image=image::load_from_memory_with_format(bytes,image::ImageFormat::Png).map_err(|_|BackendError::new("skin","Cannot decode this PNG"))?;let mut output=std::io::Cursor::new(vec![]);image.write_to(&mut output,image::ImageFormat::Png).map_err(|_|BackendError::new("skin","Cannot save this skin"))?;Ok((output.into_inner(),dimensions.1==32))
}
pub fn list(b:&Backend)->Result<Vec<Skin>>{let root=folder(b);if !root.exists(){return Ok(vec![])};fs::directory(&root,false)?;let mut out=vec![];for entry in std::fs::read_dir(&root)?{let entry=entry?;if entry.path().extension().is_none_or(|e|e!="json"){continue;}let mut skin:Skin=serde_json::from_slice(&fs::read(entry.path())?)?;validate_id(&skin.id)?;validate_model(&skin.model)?;let bytes=fs::read(root.join(format!("{}.png",skin.id)))?;skin.preview=format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(bytes));out.push(skin);if out.len()>256{return Err(BackendError::new("skin","Skin library is too large"));}}out.sort_by(|a,b|a.name.cmp(&b.name));Ok(out)}
#[tauri::command]pub fn list_skins(backend:State<'_,Arc<Backend>>)->Result<Vec<Skin>>{list(&backend)}
#[tauri::command]pub async fn import_skin(backend:State<'_,Arc<Backend>>,app:AppHandle)->Result<Option<Skin>>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;let _lease=b.lease("skin-library")?;if list(&b)?.len()>=256{return Err(BackendError::new("skin","The skin library can store up to 256 skins"));}let Some(file)=app.dialog().file().add_filter("Minecraft skin",&["png"]).blocking_pick_file()else{return Ok(None)};let path=file.into_path().map_err(|_|BackendError::new("skin","Invalid skin path"))?;let (bytes,legacy)=normalize(&fs::read(&path)?)?;let skin=Skin{id:uuid::Uuid::new_v4().to_string(),name:path.file_stem().unwrap_or_default().to_string_lossy().chars().take(128).collect(),model:"classic".into(),legacy,preview:format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(&bytes))};let root=folder(&b);fs::write(root.join(format!("{}.png",skin.id)),&bytes)?;storage::write_json(&root.join(format!("{}.json",skin.id)),&skin)?;Ok(Some(skin))}).await.map_err(|_|BackendError::new("skin","Cannot import this skin"))?}
#[tauri::command]pub fn edit_skin(backend:State<'_,Arc<Backend>>,id:String,name:String,model:String)->Result<()>{let _lease=backend.inner().lease("skin-library")?;validate_id(&id)?;validate_model(&model)?;let name=name.trim();if name.is_empty()||name.chars().count()>128||name.chars().any(char::is_control){return Err(BackendError::new("skin","Enter a skin name of up to 128 characters"));}let path=folder(&backend).join(format!("{id}.json"));let mut skin:Skin=serde_json::from_slice(&fs::read(&path)?)?;if skin.legacy&&model=="slim"{return Err(BackendError::new("skin","Legacy 64 × 32 skins use the Classic model"));}skin.name=name.into();skin.model=model;storage::write_json(&path,&skin)}
#[tauri::command]pub fn remove_skin(backend:State<'_,Arc<Backend>>,id:String)->Result<()>{let _lease=backend.inner().lease("skin-library")?;validate_id(&id)?;let root=folder(&backend);fs::remove_file(root.join(format!("{id}.json")))?;fs::remove_file(root.join(format!("{id}.png")))?;Ok(())}
#[tauri::command]pub async fn apply_skin(backend:State<'_,Arc<Backend>>,id:String,account_id:String)->Result<()>{
    let b=backend.inner().clone();let _lease=b.lease("skin-library")?;validate_id(&id)?;let selection=Instance{overrides:Overrides{account:Some(account_id.clone()),..Overrides::default()},..Instance::default()};let (account,_account_dependency)=super::account_resources::launch(&b,&selection)?;if account.id!=account_id{return Err(BackendError::new("account","The selected account no longer exists"));}
    if account.provider!="microsoft"{return Err(BackendError::new("skin_provider","Skin changes require a Minecraft Java Microsoft account"));}
    let skin=list(&b)?.into_iter().find(|s|s.id==id).ok_or_else(||BackendError::new("skin","Skin no longer exists"))?;let identity=super::microsoft::identity(&b,&account).await?;let token=zeroize::Zeroizing::new(identity.access_token);
    let bytes=fs::read(folder(&b).join(format!("{id}.png")))?;let boundary=format!("Canary{}",uuid::Uuid::new_v4().simple());
    let mut body=format!("--{boundary}\r\nContent-Disposition: form-data; name=\"variant\"\r\n\r\n{}\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"skin.png\"\r\nContent-Type: image/png\r\n\r\n",skin.model).into_bytes();body.extend(bytes);body.extend(format!("\r\n--{boundary}--\r\n").bytes());
    let response=b.private_api_client.post("https://api.minecraftservices.com/minecraft/profile/skins").bearer_auth(token.as_str()).header("Content-Type",format!("multipart/form-data; boundary={boundary}")).body(body).send().await?;
    if !response.status().is_success(){return Err(BackendError::new("skin_upload",match response.status().as_u16(){401|403=>"Minecraft did not accept this session. Sign in again.",429=>"Too many skin changes. Wait a moment and try again.",_=>"Minecraft could not change your skin. Try again later."}));}
    // Refresh the public skin URL using the existing authenticated profile flow.
    let _=super::microsoft::identity(&b,&account).await;Ok(())
}
#[cfg(test)]mod tests{use super::*;#[test]fn png_validation_checks_dimensions_and_format(){for (w,h,ok) in [(64,64,true),(64,32,true),(128,128,false),(64,128,false)]{let mut bytes=std::io::Cursor::new(vec![]);image::DynamicImage::new_rgba8(w,h).write_to(&mut bytes,image::ImageFormat::Png).unwrap();assert_eq!(normalize(&bytes.into_inner()).is_ok(),ok);}assert!(normalize(b"not a png").is_err());}}

#[derive(Serialize)]pub struct AccountSkin{pub account_id:String,pub provider:String,pub model:String,pub legacy:bool,pub preview:String}
fn texture_for(account:&Account,profile:&serde_json::Value)->Result<Option<(reqwest::Url,String)>>{
 let expected=uuid::Uuid::parse_str(&account.uuid).map_err(|_|BackendError::new("skin","Invalid account identity"))?;
 if profile["id"].as_str().and_then(|id|uuid::Uuid::parse_str(id).ok())!=Some(expected){return Err(BackendError::new("skin","Skin profile does not match the selected account"));}
 let Some(encoded)=profile["properties"].as_array().and_then(|values|values.iter().find(|p|p["name"]=="textures")).and_then(|p|p["value"].as_str())else{return Ok(None)};
 if encoded.len()>64*1024{return Err(BackendError::new("skin","Skin profile is too large"));}
 let bytes=base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_|BackendError::new("skin","Invalid skin profile"))?;
 let data:serde_json::Value=serde_json::from_slice(&bytes)?;
 if data.get("profileId").is_some()&&data["profileId"].as_str().and_then(|id|uuid::Uuid::parse_str(id).ok())!=Some(expected){return Err(BackendError::new("skin","Texture identity does not match the account"));}
 let skin=&data["textures"]["SKIN"];let Some(raw)=skin["url"].as_str()else{return Ok(None)};
 let mut url=reqwest::Url::parse(raw).map_err(|_|BackendError::new("skin","Invalid texture URL"))?;
 let allowed=match account.provider.as_str(){"microsoft"=>url.host_str()==Some("textures.minecraft.net"),"elyby"=>matches!(url.host_str(),Some("ely.by"|"textures.minecraft.net")),_=>false};
 if !allowed{return Err(BackendError::new("skin","Texture source does not match the account provider"));}
 if url.scheme()=="http"{let _=url.set_scheme("https");}
 super::network::public_url(&url)?;
 let model=match skin["metadata"]["model"].as_str(){None|Some("default"|"classic")=>"classic",Some("slim")=>"slim",_=>return Err(BackendError::new("skin","Unsupported skin model"))};
 Ok(Some((url,model.into())))
}
async fn read_account_skin(b:&Arc<Backend>,account_id:&str)->Result<Option<AccountSkin>>{
 let selection=Instance{overrides:Overrides{account:Some(account_id.into()),..Overrides::default()},..Instance::default()};
 let (account,_dependency)=super::account_resources::launch(b,&selection)?;
 if account.id!=account_id{return Err(BackendError::new("account","The selected account no longer exists"));}
 if !matches!(account.provider.as_str(),"microsoft"|"elyby"){return Ok(None)}
 let uuid=uuid::Uuid::parse_str(&account.uuid).map_err(|_|BackendError::new("skin","Invalid account identity"))?.simple().to_string();
 let endpoint=if account.provider=="microsoft"{format!("https://sessionserver.mojang.com/session/minecraft/profile/{uuid}")}else{format!("https://authserver.ely.by/session/profile/{uuid}")};
 // Query the exact signed-in profile UUID. Never search a third-party skin catalog by nickname.
 let response=b.private_api_client.get(endpoint).timeout(std::time::Duration::from_secs(10)).send().await?;
 if matches!(response.status().as_u16(),204|404){return Ok(None)}
 let profile:serde_json::Value=serde_json::from_slice(&super::network::bytes(response.error_for_status()?,128*1024).await?)?;
 let Some((url,model))=texture_for(&account,&profile)?else{return Ok(None)};
 // No redirects: a trusted profile cannot redirect the reader to an unrelated origin.
 let response=b.private_api_client.get(url).timeout(std::time::Duration::from_secs(10)).send().await?.error_for_status()?;
 let (bytes,legacy)=normalize(&super::network::bytes(response,1024*1024).await?)?;
 Ok(Some(AccountSkin{account_id:account.id,provider:account.provider,model:if legacy{"classic".into()}else{model},legacy,preview:format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(bytes))}))
}
#[tauri::command]pub async fn get_account_skin(backend:State<'_,Arc<Backend>>,account_id:String)->Result<Option<AccountSkin>>{read_account_skin(backend.inner(),&account_id).await}
#[tauri::command]pub async fn save_account_skin(backend:State<'_,Arc<Backend>>,account_id:String)->Result<Skin>{
 let b=backend.inner().clone();let _lease=b.lease("skin-library")?;
 if list(&b)?.len()>=256{return Err(BackendError::new("skin","The skin library can store up to 256 skins"));}
 let current=read_account_skin(&b,&account_id).await?.ok_or_else(||BackendError::new("skin","This account has no skin to save"))?;
 let name=b.store.lock().unwrap().accounts.iter().find(|a|a.id==account_id).map(|a|a.username.clone()).ok_or_else(||BackendError::new("account","The selected account no longer exists"))?;
 let encoded=current.preview.strip_prefix("data:image/png;base64,").ok_or_else(||BackendError::new("skin","Invalid skin image"))?;
 let bytes=base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_|BackendError::new("skin","Invalid skin image"))?;
 let skin=Skin{id:uuid::Uuid::new_v4().to_string(),name,model:current.model,legacy:current.legacy,preview:current.preview};
 let root=folder(&b);let png=root.join(format!("{}.png",skin.id));fs::write(&png,bytes)?;
 if let Err(error)=storage::write_json(&root.join(format!("{}.json",skin.id)),&skin){let _=fs::remove_file(png);return Err(error)}
 Ok(skin)
}
#[cfg(test)]mod account_skin_tests{
 use super::*;use serde_json::json;
 fn account(provider:&str)->Account{Account{id:"fixture".into(),provider:provider.into(),uuid:"ffc8fdc95824509e8a57c99b940fb996".into(),username:"Fixture".into(),avatar:None,status:"authenticated".into(),last_used:None,credential_ref:None}}
 fn profile(url:&str,model:&str)->serde_json::Value{json!({"id":"ffc8fdc95824509e8a57c99b940fb996","properties":[{"name":"textures","value":base64::engine::general_purpose::STANDARD.encode(serde_json::to_vec(&json!({"profileId":"ffc8fdc95824509e8a57c99b940fb996","textures":{"SKIN":{"url":url,"metadata":{"model":model}}}})).unwrap())}]})}
 #[test]fn uses_exact_provider_texture_and_model(){let a=account("microsoft");let(url,model)=texture_for(&a,&profile("http://textures.minecraft.net/texture/fixture","slim")).unwrap().unwrap();assert_eq!(url.scheme(),"https");assert_eq!(model,"slim");assert!(texture_for(&a,&profile("https://ely.by/storage/skins/test.png","classic")).is_err());assert!(texture_for(&account("elyby"),&profile("https://ely.by/storage/skins/test.png","classic")).unwrap().is_some());}
 #[test]fn rejects_foreign_identity_and_untrusted_textures(){let a=account("microsoft");for url in ["https://example.com/skin.png","https://user:secret@textures.minecraft.net/texture/x","https://textures.minecraft.net:8443/texture/x","https://127.0.0.1/skin"]{assert!(texture_for(&a,&profile(url,"classic")).is_err());}let mut p=profile("https://textures.minecraft.net/texture/x","slim");p["id"]=json!(uuid::Uuid::new_v4().simple().to_string());assert!(texture_for(&a,&p).is_err());assert!(texture_for(&a,&profile("https://textures.minecraft.net/texture/x","unknown")).is_err());}
}
