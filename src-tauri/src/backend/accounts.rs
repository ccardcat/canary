use super::{Backend,model::*,storage};
pub fn local(backend:&Backend,username:&str)->Result<Account>{
    if !(3..=16).contains(&username.len())||!username.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'){return Err(BackendError::new("account_name","Use 3–16 letters, numbers or underscores"));}
    let account=Account{id:uuid::Uuid::new_v4().to_string(),provider:"local".into(),uuid:uuid::Uuid::new_v4().simple().to_string(),username:username.into(),avatar:None,status:"local".into(),last_used:None,credential_ref:None};
    {let mut store=backend.store.lock().unwrap();store.accounts.push(account.clone());store.settings.active_account=Some(account.id.clone());}
    backend.record_activity("account_added",&account.username,None)?;Ok(account)
}
pub fn selected(backend:&Backend,instance:&Instance)->Result<Account>{
    let store=backend.store.lock().unwrap();let id=instance.overrides.account.as_ref().filter(|id|!store.removed_accounts.contains(id)).or(store.settings.active_account.as_ref()).or_else(||store.accounts.iter().max_by_key(|a|a.last_used.unwrap_or(0)).map(|a|&a.id)).ok_or_else(||BackendError::new("account_required","Select an account before playing"))?;
    store.accounts.iter().find(|a|&a.id==id).cloned().ok_or_else(||BackendError::new("account_required","Selected account does not exist"))
}
// Launch credentials deliberately have no Serialize or Debug implementation.
// Remote providers must return a validated session here before they can launch.
pub struct LaunchIdentity {pub username:String,pub uuid:String,pub access_token:String,pub user_type:String,pub xuid:String,pub client_id:String}
pub fn launch_identity(account:&Account)->Result<LaunchIdentity>{
    match account.provider.as_str(){"local"=>Ok(LaunchIdentity{username:account.username.clone(),uuid:account.uuid.clone(),access_token:"0".into(),user_type:"legacy".into(),xuid:String::new(),client_id:String::new()}),"elyby"|"microsoft"=>Err(BackendError::new("auth_not_configured","A validated remote authentication session is required before launch")),_=>Err(BackendError::new("account","Unknown account provider"))}
}
pub fn providers()->serde_json::Value{serde_json::json!({
    "local":{"configured":true},
    "elyby":{"configured":true},
    "microsoft":{"configured":true},
    "curseforge":{"configured":super::curseforge::configured(),"requirement":"Set CANARY_CURSEFORGE_API_KEY using your own official CurseForge API key"}
})}
// Windows Credential Manager only. Remote providers will use this shared store;
// non-sensitive account metadata never contains access/refresh credentials.
#[allow(dead_code)]
pub fn save_credentials(id:&str,secret:&str)->Result<()> {
    keyring::Entry::new("Canary",id).and_then(|entry|entry.set_password(secret)).map_err(|_|BackendError::new("secure_storage","OS credential storage is unavailable"))
}
#[allow(dead_code)]
pub fn credentials(id:&str)->Result<String>{keyring::Entry::new("Canary",id).and_then(|entry|entry.get_password()).map_err(|_|BackendError::new("secure_storage","Cannot read account credential"))}
pub fn remove(backend:&Backend,id:&str)->Result<()> {
    let _guard=super::account_resources::removal(backend,id)?;
    remove_reserved(backend,id)
}
pub fn remove_reserved(backend:&Backend,id:&str)->Result<()> {
    let account={let store=backend.store.lock().unwrap();store.accounts.iter().find(|a|a.id==id).cloned().ok_or_else(||BackendError::new("account","Account not found"))?};
    if let Some(reference)=account.credential_ref{match keyring::Entry::new("Canary",&reference).and_then(|entry|entry.delete_credential()){Ok(())|Err(keyring::Error::NoEntry)=>{},Err(_)=>return Err(BackendError::new("secure_storage","Cannot remove account credential"))};}
    {let mut store=backend.store.lock().unwrap();store.accounts.retain(|a|a.id!=id);store.removed_accounts.push(id.into());for instance in &mut store.instance_catalog{if instance.overrides.account.as_deref()==Some(id){instance.overrides.account=None;}}if store.settings.active_account.as_deref()==Some(id){store.settings.active_account=store.accounts.first().map(|a|a.id.clone());}}
    backend.persist()?;
    // Clear available metadata; tombstones also cover unavailable drives and
    // copies held by installers/process monitors that are saved later.
    for root in backend.instance_roots(){for mut instance in storage::instances_in(&root).unwrap_or_default(){if instance.overrides.account.as_deref()==Some(id){instance.overrides.account=None;backend.save_instance(&instance)?;}}}
    backend.record_activity("account_removed",&account.username,None)
}
#[cfg(test)]mod tests {use super::*;#[test]fn provider_identity_is_explicit(){let a=Account{id:"internal".into(),provider:"local".into(),uuid:uuid::Uuid::new_v4().simple().to_string(),username:"Player".into(),avatar:None,status:"local".into(),last_used:None,credential_ref:None};let restored:Account=serde_json::from_str(&serde_json::to_string(&a).unwrap()).unwrap();assert_eq!(a.uuid,restored.uuid);assert_eq!(restored.provider,"local");assert_eq!(restored.credential_ref,None);}
#[test]fn local_accounts_restore_and_switch_independently(){let root=std::env::temp_dir().join(format!("canary-accounts-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let backend=Backend::with_root(root.clone()).unwrap();assert!(local(&backend,"bad name").is_err());let one=local(&backend,"PlayerOne").unwrap();let two=local(&backend,"PlayerTwo").unwrap();let restored=Backend::with_root(root).unwrap();assert_eq!(selected(&restored,&Instance::default()).unwrap().uuid,two.uuid);let i=Instance{overrides:Overrides{account:Some(one.id.clone()),..Overrides::default()},..Instance::default()};assert_eq!(selected(&restored,&i).unwrap().uuid,one.uuid);remove(&restored,&two.id).unwrap();assert_eq!(selected(&restored,&Instance::default()).unwrap().uuid,one.uuid);assert_eq!(selected(&restored,&Instance{overrides:Overrides{account:Some(two.id),..Overrides::default()},..Instance::default()}).unwrap().id,one.id);}
}

#[cfg(test)]mod selection_tests{use super::*;
    #[test]fn last_used_default_respects_explicit_account_and_instance_override(){let root=std::env::temp_dir().join(format!("canary-accounts-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let b=Backend::with_root(root).unwrap();let first=local(&b,"FirstQA").unwrap();let second=local(&b,"SecondQA").unwrap();{let mut store=b.store.lock().unwrap();store.accounts[0].last_used=Some(100);store.accounts[1].last_used=Some(200);store.settings.active_account=None;}let mut instance=Instance::default();assert_eq!(selected(&b,&instance).unwrap().id,second.id);b.store.lock().unwrap().settings.active_account=Some(first.id.clone());assert_eq!(selected(&b,&instance).unwrap().id,first.id);instance.overrides.account=Some(second.id.clone());assert_eq!(selected(&b,&instance).unwrap().id,second.id);instance.overrides.account=Some("missing-account".into());assert_eq!(selected(&b,&instance).err().unwrap().code,"account_required");}
}
