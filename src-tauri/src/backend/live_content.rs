//! A running game may receive new content files, but its existing files and
//! loaded worlds are immutable until it closes.
use super::{Backend,content::{self,Item,State},model::*,protected_fs as fs,storage};
use std::path::PathBuf;
pub fn apply(b:&Backend,id:&str,mut state:State,files:Vec<(Item,PathBuf)>)->Result<State>{
 let root=b.instance_path(id)?;
 let mut seen=std::collections::HashSet::new();
 for (item,_) in &files{
  if !seen.insert(content::location(item).to_ascii_lowercase())||item.kind=="mod"&&state.items.iter().any(|old|old.kind=="mod"&&old.enabled&&!old.missing&&old.mod_ids.iter().any(|id|item.mod_ids.contains(id))){return Err(BackendError::new("content_duplicate","A file or mod with this identity is already installed"));}
  if !matches!(item.kind.as_str(),"mod"|"shader"|"resourcepack")||!item.enabled||state.items.iter().any(|old|old.path==item.path||item.project.is_some()&&old.provider==item.provider&&old.project==item.project&&old.kind==item.kind)||storage::safe_join(&root,&content::location(item))?.exists(){return Err(BackendError::new("content_running_update","New mods, shaders and resource packs can be added while playing. Stop Minecraft before replacing, removing or changing existing content."));}
 }
 let original=state.clone();let mut added=vec![];let changes=files.iter().map(|(item,_)|item.clone()).collect::<Vec<_>>();
 let result=(||{for (item,source) in files{let target=storage::safe_join(&root,&content::location(&item))?;fs::create_dir_all(target.parent().unwrap())?;// Publish a complete file on the destination volume, including custom storage drives.
 fs::copy(&source,&target)?;added.push(target);fs::remove_file(source)?;state.items.push(item);}content::record(b,id,&mut state,"install",&changes)?;content::save(&root,&state)?;Ok::<_,BackendError>(())})();
 if let Err(error)=result{for target in added{let _=fs::remove_file(target);}content::save(&root,&original)?;return Err(error)}Ok(state)
}
#[cfg(test)]mod tests{
 use super::*;
 fn setup()->(Backend,storage::Staging){let root=std::env::temp_dir().join(format!("canary-live-content-{}",uuid::Uuid::new_v4()));let cleanup=storage::Staging(root.clone());let b=Backend::with_root(root).unwrap();let path=b.instance_path("game").unwrap();fs::create_dir_all(&path).unwrap();b.save_instance(&Instance{id:"game".into(),minecraft:"1.21.1".into(),..Instance::default()}).unwrap();fs::write(path.join("mods/old.jar"),b"loaded mod").unwrap();fs::write(path.join("saves/World/level.dat"),b"running world").unwrap();(b,cleanup)}
 fn item(path:&str)->Item{serde_json::from_value(serde_json::json!({"id":uuid::Uuid::new_v4().to_string(),"name":"New mod","version":"1","kind":"mod","path":path,"enabled":true,"source":"local","hash":"a".repeat(128),"size":3,"compatibility":"possible","missing":false})).unwrap()}
 #[test]fn adding_new_content_preserves_loaded_mods_and_worlds(){let(b,_c)=setup();let temp=b.root.join("new.jar");fs::write(&temp,b"new").unwrap();let state=apply(&b,"game",State::default(),vec![(item("mods/new.jar"),temp)]).unwrap();let root=b.instance_path("game").unwrap();assert_eq!(state.items.len(),1);assert_eq!(fs::read(root.join("mods/new.jar")).unwrap(),b"new");assert_eq!(fs::read(root.join("mods/old.jar")).unwrap(),b"loaded mod");assert_eq!(fs::read(root.join("saves/World/level.dat")).unwrap(),b"running world");let replacement=b.root.join("replacement.jar");fs::write(&replacement,b"replacement").unwrap();assert_eq!(apply(&b,"game",state,vec![(item("mods/old.jar"),replacement)]).err().unwrap().code,"content_running_update");assert_eq!(fs::read(root.join("mods/old.jar")).unwrap(),b"loaded mod");}
 #[test]fn failed_live_add_removes_only_new_files(){let(b,_c)=setup();let source=b.root.join("first.jar");fs::write(&source,b"new").unwrap();assert!(apply(&b,"game",State::default(),vec![(item("mods/first.jar"),source),(item("mods/second.jar"),b.root.join("missing.jar"))]).is_err());let root=b.instance_path("game").unwrap();assert!(!root.join("mods/first.jar").exists());assert_eq!(fs::read(root.join("mods/old.jar")).unwrap(),b"loaded mod");assert_eq!(fs::read(root.join("saves/World/level.dat")).unwrap(),b"running world");assert!(content::load(&root).unwrap().items.is_empty());}
}
