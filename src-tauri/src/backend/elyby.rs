//! The documented Ely.by launcher protocol; no OAuth client secret/password storage.
use super::{accounts, Backend, download::{self,Artifact,Job}, model::*};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::sync::Arc;
use zeroize::{Zeroize,Zeroizing};

#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Session {access_token:String,client_token:String,selected_profile:Profile}
#[derive(Serialize,Deserialize)]
struct Profile {id:String,name:String}
impl Drop for Session {fn drop(&mut self){self.access_token.zeroize();self.client_token.zeroize();}}

async fn request(backend:&Backend,method:&str,mut body:Value)->Result<Option<Value>> {
    let request=backend.private_api_client.post(format!("https://authserver.ely.by/auth/{method}"))
        .timeout(std::time::Duration::from_secs(25)).json(&body);
    for field in ["password","accessToken","clientToken"]{if let Some(Value::String(secret))=body.get_mut(field){secret.zeroize();}}drop(body);
    let response=request.send().await?;
    let status=response.status();
    if status.is_success(){let bytes=response.bytes().await?;return if bytes.is_empty(){Ok(None)}else{Ok(Some(serde_json::from_slice(&bytes)?))};}
    let value:Value=response.json().await.unwrap_or(Value::Null);
    let two_factor=value["errorMessage"].as_str().is_some_and(|s|s.to_ascii_lowercase().contains("two factor"));
    Err(BackendError::new(if two_factor{"auth_two_factor"}else if matches!(status.as_u16(),400|401|403){if method=="authenticate"{"auth_invalid"}else{"auth_expired"}}else if status.as_u16()==429{"http_429"}else{"auth_service"},
        if two_factor{"Enter a two-factor authentication code and submit your credentials again"}else{"Ely.by rejected the authentication request"}))
}
fn session(value:Value,expected:&str)->Result<Session>{
    let result:Session=serde_json::from_value(value).map_err(|_|BackendError::new("auth_profile","Ely.by did not return a usable profile"))?;
    if result.access_token.is_empty()||result.client_token!=expected||uuid::Uuid::parse_str(&result.selected_profile.id).is_err()||result.selected_profile.name.is_empty(){return Err(BackendError::new("auth_profile","Ely.by returned an invalid identity"));}Ok(result)
}
fn store(backend:&Backend,session:&Session)->Result<Account>{
    let uuid=uuid::Uuid::parse_str(&session.selected_profile.id).unwrap().simple().to_string();
    let existing=backend.store.lock().unwrap().accounts.iter().find(|a|a.provider=="elyby"&&a.uuid==uuid).cloned();
    let id=existing.as_ref().map(|a|a.id.clone()).unwrap_or_else(||uuid::Uuid::new_v4().to_string());
    let reference=format!("elyby-{id}");
    let encoded=Zeroizing::new(serde_json::to_string(session)?);accounts::save_credentials(&reference,&encoded)?;
    let account=Account{id:id.clone(),provider:"elyby".into(),uuid,username:session.selected_profile.name.clone(),avatar:None,status:"authenticated".into(),last_used:existing.and_then(|a|a.last_used),credential_ref:Some(reference)};
    {let mut state=backend.store.lock().unwrap();state.accounts.retain(|a|a.id!=id);state.accounts.push(account.clone());state.settings.active_account=Some(id);}
    backend.persist()?;Ok(account)
}
pub async fn authenticate(backend:&Backend,username:String,password:String,otp:Option<String>)->Result<Account>{
    let mut password=Zeroizing::new(password);
    let _auth=backend.auth.lock().await;
    if username.trim().is_empty()||password.is_empty(){return Err(BackendError::new("auth_invalid","Enter your login and password"));}
    if let Some(code)=otp.filter(|s|!s.trim().is_empty()) {if code.len()!=6||!code.chars().all(|c|c.is_ascii_digit()){return Err(BackendError::new("auth_two_factor","Enter a six-digit code"));}password.push(':');password.push_str(&code);}
    let client_token=uuid::Uuid::new_v4().to_string();
    let value=request(backend,"authenticate",json!({"username":username.trim(),"password":password.as_str(),"clientToken":client_token,"requestUser":true})).await?;
    password.zeroize();
    let mut account=store(backend,&session(value.ok_or_else(||BackendError::new("auth_profile","Missing authentication response"))?,&client_token)?)?;
    account.avatar=avatar(backend,&account).await;if let Some(stored)=backend.store.lock().unwrap().accounts.iter_mut().find(|a|a.id==account.id){stored.avatar=account.avatar.clone();}backend.persist()?;Ok(account)
}
// Cosmetic profile lookup never receives a token and cannot invalidate a login.
async fn avatar(backend:&Backend,account:&Account)->Option<String>{
    use base64::Engine;
    let response=backend.private_api_client.get(format!("https://authserver.ely.by/session/profile/{}",account.uuid)).timeout(std::time::Duration::from_secs(3)).send().await.ok()?;
    if !response.status().is_success(){return None;}let data:Value=response.json().await.ok()?;if data["id"].as_str()!=Some(&account.uuid){return None;}
    let encoded=data["properties"].as_array()?.iter().find(|p|p["name"]=="textures")?["value"].as_str()?;if encoded.len()>64*1024{return None;}
    let bytes=base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;let textures:Value=serde_json::from_slice(&bytes).ok()?;let mut url=reqwest::Url::parse(textures["textures"]["SKIN"]["url"].as_str()?).ok()?;
    if !matches!(url.host_str(),Some("ely.by"|"textures.minecraft.net"))||url.port().is_some()||!url.username().is_empty()||url.password().is_some(){return None;}url.set_scheme("https").ok()?;
    let mut cosmetic=Instance{icon:Some(url.to_string()),..Instance::default()};super::artwork::cache(backend,&mut cosmetic).await.ok()?;cosmetic.icon
}
pub async fn refresh(backend:&Backend,account:&Account)->Result<()> {
 let result=refresh_session(backend,account).await;
 if let Err(error)=&result{let status=if matches!(error.code.as_str(),"auth_expired"|"secure_storage"|"auth_profile"){"expired"}else{"unavailable"};if let Some(stored)=backend.store.lock().unwrap().accounts.iter_mut().find(|a|a.id==account.id){stored.status=status.into();}let _=backend.persist();}
 result
}
async fn refresh_session(backend:&Backend,account:&Account)->Result<()> {
    let _auth=backend.auth.lock().await;
    if !backend.store.lock().unwrap().accounts.iter().any(|a|a.id==account.id){return Err(BackendError::new("auth_expired","Account was removed"));}
    let reference=account.credential_ref.as_deref().ok_or_else(||BackendError::new("auth_expired","Session is missing"))?;
    let encoded=Zeroizing::new(accounts::credentials(reference)?);
    let prior:Session=serde_json::from_str(&encoded).map_err(|_|BackendError::new("secure_storage","Cannot decode secure session"))?;
    request(backend,"validate",json!({"accessToken":prior.access_token})).await?;
    let result=request(backend,"refresh",json!({"accessToken":prior.access_token,"clientToken":prior.client_token,"requestUser":true})).await?;
    let session=session(result.ok_or_else(||BackendError::new("auth_profile","Missing refresh response"))?,&prior.client_token)?;
    if uuid::Uuid::parse_str(&session.selected_profile.id).ok().map(|u|u.simple().to_string()).as_deref()!=Some(&account.uuid){return Err(BackendError::new("auth_profile","Refreshed profile does not match account"));}
    accounts::save_credentials(reference,&Zeroizing::new(serde_json::to_string(&session)?))?;
    let skin=avatar(backend,account).await;
    {let mut state=backend.store.lock().unwrap();if let Some(a)=state.accounts.iter_mut().find(|a|a.id==account.id){a.status="authenticated".into();a.username=session.selected_profile.name.clone();a.avatar=skin.or_else(||a.avatar.clone());}}
    backend.persist()
}
pub async fn restore(backend:&Backend)->Result<()> {
    let accounts=backend.store.lock().unwrap().accounts.iter().filter(|a|a.provider=="elyby").cloned().collect::<Vec<_>>();
    for account in accounts {if let Err(error)=refresh(backend,&account).await{let status=if matches!(error.code.as_str(),"auth_expired"|"secure_storage"){"expired"}else{"unavailable"};if let Some(a)=backend.store.lock().unwrap().accounts.iter_mut().find(|a|a.id==account.id){a.status=status.into();}}}
    backend.persist()
}
pub async fn invalidate(backend:&Backend,account:&Account)->Result<()> {
    if let Some(reference)=&account.credential_ref {let encoded=Zeroizing::new(accounts::credentials(reference)?);let session:Session=serde_json::from_str(&encoded).map_err(|_|BackendError::new("secure_storage","Cannot decode secure session"))?;request(backend,"invalidate",json!({"accessToken":session.access_token,"clientToken":session.client_token})).await?;}Ok(())
}
pub async fn identity(backend:&Backend,account:&Account)->Result<accounts::LaunchIdentity>{
    refresh(backend,account).await?;
    let encoded=Zeroizing::new(accounts::credentials(account.credential_ref.as_deref().unwrap())?);
    let session:Session=serde_json::from_str(&encoded).map_err(|_|BackendError::new("secure_storage","Cannot decode secure session"))?;
    Ok(accounts::LaunchIdentity{username:session.selected_profile.name.clone(),uuid:account.uuid.clone(),access_token:session.access_token.clone(),user_type:"mojang".into(),xuid:String::new(),client_id:String::new()})
}
pub async fn agent(backend:Arc<Backend>,job:Arc<Job>)->Result<String>{
    let meta=download::json(&backend,"https://authlib-injector.yushi.moe/artifact/latest.json").await?;
    let hash=meta["checksums"]["sha256"].as_str().filter(|s|s.len()==64&&s.chars().all(|c|c.is_ascii_hexdigit())).ok_or_else(||BackendError::new("auth_agent","Publisher SHA-256 missing"))?;
    let path=backend.root.join("cache/authlib").join(format!("authlib-injector-{hash}.jar"));
    let url=meta["download_url"].as_str().ok_or_else(||BackendError::new("auth_agent","Publisher download URL missing"))?;
    download::batch(backend.clone(),vec![Artifact{url:url.into(),path:path.clone(),hash:Some(hash.into()),algorithm:"sha256",size:meta["size"].as_u64()}],job,"authentication").await?;
    Ok(format!("-javaagent:{}=ely.by",path.to_string_lossy()))
}
#[cfg(test)] mod tests {use super::*;#[test]fn profile_validation(){let v=json!({"accessToken":"disposable","clientToken":"expected","selectedProfile":{"id":"78572fe3ddb04aad99d381a57b8680bf","name":"Player"}});assert!(session(v.clone(),"wrong").is_err());assert!(session(v,"expected").is_ok());}}

#[cfg(test)]mod integration_tests {
 use super::*;
 #[test]fn secure_session_never_enters_metadata(){let root=std::env::temp_dir().join(format!("canary-ely-storage-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let b=Backend::with_root(root.clone()).unwrap();let token=format!("disposable-{}",uuid::Uuid::new_v4());let client=uuid::Uuid::new_v4().to_string();let session=Session{access_token:token.clone(),client_token:client.clone(),selected_profile:Profile{id:uuid::Uuid::new_v4().simple().to_string(),name:"StorageTest".into()}};let a=match store(&b,&session){Ok(a)=>a,Err(error)=>{assert!(!cfg!(windows),"Windows Credential Manager must be available for the native secure-session test");assert_eq!(error.code,"secure_storage");assert!(b.store.lock().unwrap().accounts.is_empty());if let Ok(meta)=std::fs::read_to_string(root.join("settings.json")){assert!(!meta.contains(&token));assert!(!meta.contains(&client));}return;}};let stored=accounts::credentials(a.credential_ref.as_deref().unwrap()).unwrap();assert!(stored.contains(&token));let meta=std::fs::read_to_string(root.join("settings.json")).unwrap();assert!(!meta.contains(&token));assert!(!meta.contains(&client));assert_eq!(Backend::with_root(root).unwrap().store.lock().unwrap().accounts[0].uuid,a.uuid);accounts::remove(&b,&a.id).unwrap();assert!(accounts::credentials(a.credential_ref.as_deref().unwrap()).is_err());}
 #[tokio::test]#[ignore="Downloads a public Ely.by example skin and the official hashed authlib-injector; no account login"]async fn real_public_artwork_and_agent(){let root=std::env::temp_dir().join(format!("canary-ely-artifacts-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root).unwrap());let account=Account{id:"public-example".into(),provider:"elyby".into(),uuid:"ffc8fdc95824509e8a57c99b940fb996".into(),username:"ErickSkrauch".into(),avatar:None,status:"public-example".into(),last_used:None,credential_ref:None};let skin=avatar(&b,&account).await.expect("Official example skin must be available over HTTPS");assert!(std::path::Path::new(&skin).is_file());assert_eq!(&std::fs::read(skin).unwrap()[..8],b"\x89PNG\r\n\x1a\n");let job=Arc::new(Job::new("authlib-test",None,Arc::new(std::sync::atomic::AtomicBool::new(false))));let argument=agent(b.clone(),job).await.unwrap();assert!(argument.starts_with("-javaagent:"));assert!(argument.ends_with("=ely.by"));let path=argument.trim_start_matches("-javaagent:").trim_end_matches("=ely.by");let expected=std::path::Path::new(path).file_stem().unwrap().to_string_lossy();assert_eq!(download::hash(std::path::Path::new(path),"sha256").unwrap(),expected.trim_start_matches("authlib-injector-"));assert!(b.store.lock().unwrap().accounts.is_empty());}
 #[tokio::test]#[ignore="One official Ely.by request with a generated nonexistent test login"]async fn real_rejected_login(){let root=std::env::temp_dir().join(format!("canary-ely-reject-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let b=Backend::with_root(root).unwrap();let result=authenticate(&b,format!("canary-qa-{}",uuid::Uuid::new_v4()),"disposable-invalid-test-password".into(),None).await;assert_eq!(result.err().unwrap().code,"auth_invalid");assert!(b.store.lock().unwrap().accounts.is_empty());}
}
