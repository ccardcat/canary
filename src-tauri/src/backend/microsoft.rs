//! Public-client authorization code + PKCE. Credentials never cross the IPC boundary.
use super::{accounts, model::*, Backend};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{sync::{Arc, atomic::Ordering}, time::Duration};
use tauri::{AppHandle, Emitter};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener};
use zeroize::{Zeroize, Zeroizing};
const CLIENT_ID: &str = "e96175e4-2fd4-43ec-8911-8335f7783ebd";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";
pub fn client_id() -> String { std::env::var("CANARY_MICROSOFT_CLIENT_ID").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| CLIENT_ID.into()) }
fn random() -> String { let mut bytes=Vec::new(); for _ in 0..4 {bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());} URL_SAFE_NO_PAD.encode(bytes) }
#[derive(Deserialize)] struct OAuth {access_token:String,refresh_token:Option<String>}
impl Drop for OAuth {fn drop(&mut self){self.access_token.zeroize();if let Some(v)=&mut self.refresh_token{v.zeroize();}}}
struct Session {token:Zeroizing<String>,uuid:String,name:String,xuid:String}
async fn json(response:reqwest::Response,stage:&str)->Result<serde_json::Value>{
    let status=response.status(); if !status.is_success(){return Err(BackendError::new(stage,match status.as_u16(){401|403=>"Microsoft/Xbox rejected the session. Sign in again and verify Minecraft ownership.",429=>"Too many requests. Please try again later.",_=>"Microsoft authentication service is unavailable. Please try again."}));} Ok(response.json().await?)
}
async fn exchange(b:&Backend,fields:&[(&str,&str)])->Result<OAuth>{
    let response=b.private_api_client.post(TOKEN_URL).form(fields).send().await?;
    let value=json(response,"microsoft_oauth").await?;
    serde_json::from_value(value).map_err(|_|BackendError::new("microsoft_oauth","Invalid Microsoft token response"))
}
async fn minecraft_session(b:&Backend,oauth:&str)->Result<Session>{
    let xbox=json(b.private_api_client.post("https://user.auth.xboxlive.com/user/authenticate").json(&serde_json::json!({"Properties":{"AuthMethod":"RPS","SiteName":"user.auth.xboxlive.com","RpsTicket":format!("d={oauth}")},"RelyingParty":"http://auth.xboxlive.com","TokenType":"JWT"})).send().await?,"xbox_auth").await?;
    let xt=xbox["Token"].as_str().ok_or_else(||BackendError::new("xbox_auth","Xbox token missing"))?;
    let response=b.private_api_client.post("https://xsts.auth.xboxlive.com/xsts/authorize").json(&serde_json::json!({"Properties":{"SandboxId":"RETAIL","UserTokens":[xt]},"RelyingParty":"rp://api.minecraftservices.com/","TokenType":"JWT"})).send().await?;
    if !response.status().is_success(){let v:serde_json::Value=response.json().await.unwrap_or_default(); let message=match v["XErr"].as_u64(){Some(2148916233)=>"Create an Xbox profile for this Microsoft account, then sign in again.",Some(2148916235)=>"Xbox Live is unavailable in this account's region.",Some(2148916236|2148916237)=>"Complete Xbox age verification before signing in.",Some(2148916238)=>"A parent must configure Xbox family permissions for this account.",_=>"Xbox authorization failed. Check your Xbox profile and sign in again."};return Err(BackendError::new("xsts_auth",message));}
    let xsts:serde_json::Value=response.json().await?;
    let hash=xsts["DisplayClaims"]["xui"][0]["uhs"].as_str().ok_or_else(||BackendError::new("xsts_auth","Xbox user hash missing"))?;
    let xuid=xsts["DisplayClaims"]["xui"][0]["xid"].as_str().unwrap_or("").to_owned();
    let token=xsts["Token"].as_str().ok_or_else(||BackendError::new("xsts_auth","Xbox session missing"))?;
    let value=json(b.private_api_client.post("https://api.minecraftservices.com/authentication/login_with_xbox").json(&serde_json::json!({"identityToken":format!("XBL3.0 x={hash};{token}"),"ensureLegacyEnabled":true})).send().await?,"minecraft_auth").await?;
    let token=Zeroizing::new(value["access_token"].as_str().ok_or_else(||BackendError::new("minecraft_auth","Minecraft session missing"))?.to_owned());
    let ownership=json(b.private_api_client.get("https://api.minecraftservices.com/entitlements/mcstore").bearer_auth(token.as_str()).send().await?,"minecraft_ownership").await?;
    if !ownership["items"].as_array().is_some_and(|items|items.iter().any(|i|matches!(i["name"].as_str(),Some("game_minecraft"|"product_minecraft")))){return Err(BackendError::new("minecraft_ownership","This Microsoft account does not own Minecraft Java Edition."));}
    let profile=json(b.private_api_client.get("https://api.minecraftservices.com/minecraft/profile").bearer_auth(token.as_str()).send().await?,"minecraft_profile").await?;
    let uuid=profile["id"].as_str().filter(|id|id.len()==32&&id.chars().all(|c|c.is_ascii_hexdigit())).ok_or_else(||BackendError::new("minecraft_profile","A valid Minecraft Java profile is required"))?.to_owned();
    let name=profile["name"].as_str().ok_or_else(||BackendError::new("minecraft_profile","Minecraft player name missing"))?.to_owned();
    Ok(Session{token,uuid,name,xuid})
}
fn callback(target:&str,state:&str)->Result<String>{
    let url=reqwest::Url::parse(&format!("http://localhost{target}")).map_err(|_|BackendError::new("microsoft_callback","Invalid callback"))?;
    if url.path()!="/"{return Err(BackendError::new("microsoft_callback","Unexpected callback path"));}
    let fields=url.query_pairs().collect::<Vec<_>>();
    let states=fields.iter().filter(|(k,_)|k=="state").collect::<Vec<_>>();
    let supplied=states.first().map(|(_,v)|v.as_bytes()).unwrap_or_default();
    let equal=supplied.len()==state.len()&&supplied.iter().zip(state.as_bytes()).fold(0u8,|diff,(a,b)|diff|(a^b))==0;
    if states.len()!=1||!equal{return Err(BackendError::new("microsoft_callback","Authentication state mismatch"));}
    if fields.iter().any(|(k,_)|k=="error"){return Err(BackendError::new("auth_cancelled","Microsoft sign-in was cancelled or denied"));}
    let codes=fields.iter().filter(|(k,_)|k=="code").collect::<Vec<_>>();
    if codes.len()!=1||codes[0].1.is_empty(){return Err(BackendError::new("microsoft_callback","Authorization code missing"));}
    Ok(codes[0].1.to_string())
}
async fn receive(listener:TcpListener,state:&str,cancel:&std::sync::atomic::AtomicBool)->Result<Zeroizing<String>>{
    let deadline=tokio::time::Instant::now()+Duration::from_secs(180);
    loop {if cancel.load(Ordering::Relaxed){return Err(BackendError::new("auth_cancelled","Sign-in cancelled"));} if tokio::time::Instant::now()>deadline{return Err(BackendError::new("timeout","Microsoft sign-in timed out. Try again."));}
        let accepted=tokio::time::timeout(Duration::from_millis(250),listener.accept()).await;
        let (mut socket,peer)=match accepted{Ok(Ok(v))=>v,Ok(Err(e))=>return Err(e.into()),Err(_)=>continue};
        if !peer.ip().is_loopback(){continue;}
        let mut bytes=Zeroizing::new(Vec::new());let mut block=[0;1024];
        while bytes.len()<8192&&!bytes.windows(4).any(|v|v==b"\r\n\r\n") {match tokio::time::timeout(Duration::from_secs(2),socket.read(&mut block)).await{Ok(Ok(n)) if n>0=>bytes.extend_from_slice(&block[..n]),_=>break,}}
        let request=String::from_utf8_lossy(&bytes);let line=request.lines().next().unwrap_or("");let parts=line.split_whitespace().collect::<Vec<_>>();
        if parts.len()!=3||parts[0]!="GET"||!parts[1].starts_with("/?"){let _=socket.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;continue;}
        let result=callback(parts[1],state);
        let message=if result.is_ok(){"Sign-in received. You can close this tab and return to Canary."}else{"Sign-in was not accepted. Return to Canary and try again."};
        let response=format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",message.len(),message);let _=socket.write_all(response.as_bytes()).await;
        match result{Ok(code)=>return Ok(Zeroizing::new(code)),Err(error) if error.code=="auth_cancelled"=>return Err(error),Err(_)=>continue}
    }
}
pub async fn begin(backend:Arc<Backend>,app:AppHandle)->Result<serde_json::Value>{
    let lease=backend.lease("auth-microsoft")?;let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await?;
    let redirect=format!("http://localhost:{}",listener.local_addr()?.port());let state=random();let verifier=Zeroizing::new(random());
    let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));let client=client_id();
    let mut url=reqwest::Url::parse("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize").unwrap();url.query_pairs_mut().extend_pairs([("client_id",client.as_str()),("response_type","code"),("redirect_uri",redirect.as_str()),("scope",SCOPE),("state",state.as_str()),("code_challenge",challenge.as_str()),("code_challenge_method","S256"),("prompt","select_account")]);
    tokio::spawn(async move {
        let auth_job=super::download::Job::new("auth-microsoft",None,lease.cancel.clone());
        let result=super::download::cancellable(&auth_job,async {
            let code=receive(listener,&state,&lease.cancel).await?;
            if lease.cancel.load(Ordering::Relaxed){return Err(BackendError::new("auth_cancelled","Sign-in cancelled"));}
            let _auth=backend.auth.lock().await;
            let oauth=exchange(&backend,&[("client_id",&client),("grant_type","authorization_code"),("code",code.as_str()),("redirect_uri",&redirect),("code_verifier",verifier.as_str())]).await?;
            let session=minecraft_session(&backend,&oauth.access_token).await?;
            if lease.cancel.load(Ordering::Relaxed){return Err(BackendError::new("auth_cancelled","Sign-in cancelled"));}
            let existing=backend.store.lock().unwrap().accounts.iter().find(|a|a.provider=="microsoft"&&a.uuid==session.uuid).cloned();
            let id=existing.map(|a|a.id).unwrap_or_else(||uuid::Uuid::new_v4().to_string());let reference=format!("microsoft-{id}");
            accounts::save_credentials(&reference,oauth.refresh_token.as_deref().ok_or_else(||BackendError::new("microsoft_oauth","Microsoft refresh token missing"))?)?;
            let account=Account{id:id.clone(),provider:"microsoft".into(),uuid:session.uuid,username:session.name,avatar:None,status:"authenticated".into(),last_used:None,credential_ref:Some(reference)};
            {let mut store=backend.store.lock().unwrap();store.accounts.retain(|a|a.id!=id);store.accounts.push(account);store.settings.active_account=Some(id);}
            backend.persist()?;Ok::<_,BackendError>(())
        }).await.map_err(|error|if error.code=="cancelled"{BackendError::new("auth_cancelled","Sign-in cancelled")}else{error});
        // Drop the listener/job before notifying the UI, so a retry can start immediately.
        drop(lease);let _=app.emit("microsoft-auth-result",match result{Ok(())=>serde_json::json!({"status":"success"}),Err(e)=>serde_json::json!({"status":"error","error":e})});let _=app.emit("instances-changed",());
    });
    Ok(serde_json::json!({"id":"auth-microsoft","url":url.as_str()}))
}
pub async fn identity(b:&Backend,account:&Account)->Result<accounts::LaunchIdentity>{
    let _auth=b.auth.lock().await;let reference=account.credential_ref.as_deref().ok_or_else(||BackendError::new("relogin","Sign in with Microsoft again"))?;
    let refresh=Zeroizing::new(accounts::credentials(reference)?);let client=client_id();
    let oauth=exchange(b,&[("client_id",client.as_str()),("grant_type","refresh_token"),("refresh_token",refresh.as_str()),("scope",SCOPE)]).await?;
    if let Some(rotated)=&oauth.refresh_token{accounts::save_credentials(reference,rotated)?;}
    let session=minecraft_session(b,&oauth.access_token).await?;
    if session.uuid!=account.uuid{return Err(BackendError::new("identity_mismatch","Microsoft account profile changed. Sign in again."));}
    {let mut store=b.store.lock().unwrap();if let Some(a)=store.accounts.iter_mut().find(|a|a.id==account.id){a.status="authenticated".into();a.username=session.name.clone();}}
    b.persist()?;
    Ok(accounts::LaunchIdentity{username:session.name,uuid:session.uuid,access_token:session.token.to_string(),user_type:"msa".into(),xuid:session.xuid,client_id:client})
}
pub async fn restore(b:&Backend){let accounts=b.store.lock().unwrap().accounts.clone();for account in accounts.into_iter().filter(|a|a.provider=="microsoft"){if let Err(error)=identity(b,&account).await{if let Some(a)=b.store.lock().unwrap().accounts.iter_mut().find(|a|a.id==account.id){a.status=if matches!(error.code.as_str(),"network"|"timeout"){"unavailable"}else{"expired"}.into();}}}let _=b.persist();}
#[cfg(test)]mod tests{use super::*;#[test]fn callback_requires_matching_state_and_unique_code(){assert_eq!(callback("/?state=s&code=ok","s").unwrap(),"ok");for target in ["/?state=x&code=ok","/?state=s&state=s&code=ok","/?state=s&code=a&code=b","/wrong?state=s&code=a"]{assert!(callback(target,"s").is_err());}}#[test]fn pkce_verifier_is_valid(){let v=random();assert!((43..=128).contains(&v.len()));assert!(v.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'));}}

#[cfg(test)]mod listener_tests {use super::*;#[tokio::test]async fn listener_rejects_forgery_then_accepts_real_state(){let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();let cancel=Arc::new(std::sync::atomic::AtomicBool::new(false));let token=cancel.clone();let receive=tokio::spawn(async move{receive(listener,"actual-state",&token).await});for query in ["/?state=wrong&code=forged","/?state=actual-state&code=valid"]{let mut client=tokio::net::TcpStream::connect(address).await.unwrap();client.write_all(format!("GET {query} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes()).await.unwrap();let mut response=String::new();client.read_to_string(&mut response).await.unwrap();assert!(response.contains("no-store"));}assert_eq!(receive.await.unwrap().unwrap().as_str(),"valid");assert!(tokio::net::TcpStream::connect(address).await.is_err());}#[tokio::test]async fn cancellation_drops_listener(){let listener=TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,0)).await.unwrap();let address=listener.local_addr().unwrap();let cancel=std::sync::atomic::AtomicBool::new(true);assert_eq!(receive(listener,"state",&cancel).await.err().unwrap().code,"auth_cancelled");assert!(tokio::net::TcpStream::connect(address).await.is_err());}}
