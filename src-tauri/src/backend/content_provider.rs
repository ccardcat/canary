//! Modrinth content plans share Canary's downloader and instance lease.
use super::{Backend,content::{self,Item,State},download::{self,Artifact,Job},model::*,storage};
use serde::{Serialize,Deserialize};
use serde_json::{Value,json};
use std::{sync::Arc,path::Path};
fn endpoint(parts:&[&str])->reqwest::Url {let mut u=reqwest::Url::parse("https://api.modrinth.com/v2/").unwrap();u.path_segments_mut().unwrap().pop_if_empty().extend(parts);u}
pub async fn search(b:&Backend,i:&Instance,kind:&str,q:&str,sort:&str,offset:u32,strict:bool)->Result<Value>{
 content::folder(kind,if kind=="datapack"{Some("validation")}else{None})?;
 if !matches!(sort,"relevance"|"downloads"|"updated"|"newest"){return Err(BackendError::new("content_search","Invalid sorting"));}
 let mut facets=vec![vec![format!("project_type:{}",if kind=="datapack"{"mod"}else{kind})]];
 if kind=="datapack"{facets.push(vec!["categories:datapack".into()]);}
 if strict{facets.push(vec![format!("versions:{}",i.minecraft)]);if kind=="mod"{facets.push(vec![format!("categories:{}",i.loader)]);}}
 let mut u=endpoint(&["search"]);u.query_pairs_mut().append_pair("query",q).append_pair("index",sort).append_pair("offset",&offset.to_string()).append_pair("limit","20").append_pair("facets",&json!(facets).to_string());download::json(b,u.as_str()).await
}
pub async fn project(b:&Backend,id:&str)->Result<Value>{download::json(b,endpoint(&["project",id]).as_str()).await}
pub async fn detail(b:&Backend,id:&str)->Result<Value>{let mut data=project(b,id).await?;if let Some(team)=data["team"].as_str(){if let Ok(members)=download::json(b,endpoint(&["team",team,"members"]).as_str()).await{data["canary_authors"]=json!(members.as_array().into_iter().flatten().filter_map(|m|m["user"]["username"].as_str()).collect::<Vec<_>>());}}Ok(data)}
pub fn compatible(v:&Value,i:&Instance,kind:&str)->bool {
 v["game_versions"].as_array().is_some_and(|a|a.iter().any(|x|x==&i.minecraft)) &&
 match kind {"mod"=>i.loader!="vanilla"&&v["loaders"].as_array().is_some_and(|a|a.iter().any(|x|x==&i.loader)),"datapack"=>v["loaders"].as_array().is_some_and(|a|a.iter().any(|x|x=="datapack")),"shader"|"resourcepack"=>true,_=>false}
}
fn shader_supported(version:&Value,state:&State)->bool{version["loaders"].as_array().is_some_and(|loaders|loaders.iter().any(|loader|state.items.iter().any(|i|i.enabled&&!i.missing&&i.mod_ids.iter().any(|id|match loader.as_str(){Some("iris")=>matches!(id.as_str(),"iris"|"oculus"),Some("optifine")=>id=="optifine",Some("canvas")=>id=="canvas",_=>false}))))}
pub async fn versions(b:&Backend,i:&Instance,p:&str,kind:&str,beta:bool)->Result<Vec<Value>>{
 let mut u=endpoint(&["project",p,"version"]);u.query_pairs_mut().append_pair("game_versions",&json!([i.minecraft]).to_string());
 let shader_state=if kind=="shader"{Some(content::scan(b,&i.id)?)}else{None};
 let data=download::json(b,u.as_str()).await?;let mut list=data.as_array().ok_or_else(||BackendError::new("metadata","Missing project versions"))?.iter().filter(|v|compatible(v,i,kind)&&shader_state.as_ref().is_none_or(|s|shader_supported(v,s))&&(beta||v["version_type"]=="release")).cloned().collect::<Vec<_>>();
 list.sort_by(|a,b|{let ar=a["version_type"]=="release";let br=b["version_type"]=="release";br.cmp(&ar).then_with(||b["date_published"].as_str().cmp(&a["date_published"].as_str()))});Ok(list)
}
#[derive(Clone,Serialize,Deserialize)]
pub struct Planned {#[serde(default="content::default_provider")]pub provider:String,pub project:String,pub version:String,pub name:String,pub number:String,pub kind:String,pub icon:Option<String>,pub file:Value,#[serde(default)]pub required:bool,pub dependencies:Vec<String>}
#[derive(Clone,Serialize,Deserialize)]
pub struct Plan {pub items:Vec<Planned>,pub optional:Vec<String>,pub world:Option<String>,pub fingerprint:String}
pub async fn preview(b:&Backend,i:&Instance,p:&str,version:Option<&str>,kind:&str,world:Option<String>,beta:bool)->Result<Plan>{
 let root=b.instance_path(&i.id)?;let state=content::scan(b,&i.id)?;
 if kind=="datapack"{let rel=content::folder(kind,world.as_deref())?;let w=storage::safe_join(&root,&rel)?.parent().unwrap().to_path_buf();if !w.join("level.dat").is_file(){return Err(BackendError::new("world_required","Select an existing Minecraft world"));}}
 if kind=="shader"&&!state.items.iter().any(|x|x.enabled&&!x.missing&&x.kind=="mod"&&["iris","oculus","optifine","canvas"].iter().any(|name|x.mod_ids.iter().any(|id|id==name))){return Err(BackendError::new("shader_support","This instance needs compatible Iris, Oculus or OptiFine before installing shaders"));}
 let root_project=project(b,p).await?;let canonical=root_project["id"].as_str().ok_or_else(||BackendError::new("metadata","Project ID missing"))?.to_owned();let mut known=std::collections::HashMap::from([(canonical.clone(),root_project)]);
 let mut pending=vec![(Some(canonical),version.map(str::to_owned),kind.to_owned(),false)];let mut items=vec![];let mut optional=vec![];let mut seen=std::collections::HashMap::new();
 while let Some((project_id,version_id,kind,required))=pending.pop(){
  if items.len()>=64{return Err(BackendError::new("dependency","Dependency graph exceeds 64 projects"));}
  let v=if let Some(id)=version_id {let v=download::json(b,endpoint(&["version",&id]).as_str()).await?;if project_id.as_ref().is_some_and(|p|v["project_id"].as_str()!=Some(p)){return Err(BackendError::new("dependency","Version belongs to another project"));}if !compatible(&v,i,&kind){return Err(BackendError::new("content_incompatible",format!("Version does not support {} / {}",i.minecraft,i.loader)));}v}else{versions(b,i,project_id.as_deref().ok_or_else(||BackendError::new("dependency","Dependency has no project or version"))?,&kind,beta).await?.into_iter().next().ok_or_else(||BackendError::new("content_incompatible",format!("No compatible release for Minecraft {} / {}",i.minecraft,i.loader)))?};
  if kind=="shader"&&!shader_supported(&v,&state){return Err(BackendError::new("shader_support","This shader does not support the installed shader loader"));}
  let pid=v["project_id"].as_str().ok_or_else(||BackendError::new("metadata","Project ID missing"))?.to_owned();
  let vid=v["id"].as_str().ok_or_else(||BackendError::new("metadata","Version ID missing"))?.to_owned();
  if let Some(previous)=seen.insert(pid.clone(),vid.clone()){if previous!=vid{return Err(BackendError::new("dependency","Conflicting required dependency versions"));}continue;}
  let detail=if let Some(cached)=known.remove(&pid){cached}else{project(b,&pid).await?};
  if kind=="mod"&&detail["client_side"]=="unsupported"{return Err(BackendError::new("content_incompatible","Server-only mod cannot be installed in a client instance"));}
  if (kind=="mod"&&detail["project_type"]!="mod")||(kind=="shader"&&detail["project_type"]!="shader")||(kind=="resourcepack"&&detail["project_type"]!="resourcepack"){return Err(BackendError::new("content_type","Project content type does not match"));}
  let mut deps=vec![];
  if let Some(list)=v["dependencies"].as_array(){for d in list {let dp=d["project_id"].as_str().map(str::to_owned);let dv=d["version_id"].as_str().map(str::to_owned);match d["dependency_type"].as_str(){Some("required")=>{let dp=if dp.is_some(){dp}else if let Some(v)=&dv{download::json(b,endpoint(&["version",v]).as_str()).await?["project_id"].as_str().map(str::to_owned)}else{None};let dp=dp.ok_or_else(||BackendError::new("dependency","Required dependency has no provider project"))?;deps.push(dp.clone());let dep=project(b,&dp).await?;let dep_kind=match dep["project_type"].as_str(){Some("mod") if dep["loaders"].as_array().is_some_and(|l|l.iter().any(|x|x=="datapack"))&&kind=="datapack"=>"datapack",Some("mod")=>"mod",Some("resourcepack")=>"resourcepack",Some("shader")=>"shader",_=>return Err(BackendError::new("dependency","Unsupported dependency content type"))};pending.push((Some(dp.clone()),dv,dep_kind.into(),true));known.insert(dp,dep);},Some("optional")=>optional.push(dp.or(dv).unwrap_or_else(||d["file_name"].as_str().unwrap_or("Dependency").into())),Some("incompatible")=>{if state.items.iter().any(|x|x.enabled&&(dp.as_ref().is_some_and(|p|x.project.as_ref()==Some(p))||dv.as_ref().is_some_and(|v|x.provider_version.as_ref()==Some(v)))){return Err(BackendError::new("dependency","An installed project is declared incompatible"));}},_=>{}}}}
  let files=v["files"].as_array().ok_or_else(||BackendError::new("metadata","Version has no files"))?;let f=files.iter().find(|f|f["primary"]==true).or_else(||files.first()).ok_or_else(||BackendError::new("metadata","Version file missing"))?.clone();
  if f["hashes"]["sha512"].as_str().is_none(){return Err(BackendError::new("checksum","Provider SHA-512 missing"));}
  items.push(Planned{provider:"modrinth".into(),project:pid,version:vid,name:detail["title"].as_str().unwrap_or("Project").into(),number:v["version_number"].as_str().unwrap_or("").into(),kind,icon:detail["icon_url"].as_str().map(str::to_owned),file:f,required,dependencies:deps});
 }
 let bytes=serde_json::to_vec(&json!({"items":items,"world":world,"minecraft":i.minecraft,"loader":i.loader}))?;use sha2::Digest;let fingerprint=format!("{:x}",sha2::Sha256::digest(bytes));Ok(Plan{items,optional,world,fingerprint})
}
// A single transaction applies files only after every download and verification succeeded.
pub fn apply(b:&Backend,id:&str,state:State,files:Vec<(Item,std::path::PathBuf)>)->Result<State>{apply_transaction(b,id,state,files,&[],None)}
pub fn apply_transaction(b:&Backend,id:&str,mut state:State,files:Vec<(Item,std::path::PathBuf)>,retired:&[String],pack:Option<super::content::PackSnapshot>)->Result<State>{
 for (item,_) in &files{if item.kind=="mod"&&state.items.iter().any(|old|old.enabled&&!old.missing&&!retired.contains(&old.id)&&old.provider!=item.provider&&old.mod_ids.iter().any(|id|item.mod_ids.contains(id))){return Err(BackendError::new("content_duplicate","This mod is already installed from another provider. Remove it explicitly before switching providers."));}}
 let pack_update=pack.is_some();let root=b.instance_path(id)?;let mut next=state.items.iter().filter(|item|!retired.contains(&item.id)).cloned().collect::<Vec<_>>();let mut changed=vec![];
 for (item,_) in &files {let old=next.iter().find(|x|x.path==item.path||item.project.is_some()&&x.provider==item.provider&&x.project==item.project&&x.kind==item.kind&&Path::new(&x.path).parent()==Path::new(&item.path).parent()).or_else(||state.items.iter().find(|x|retired.contains(&x.id)&&(x.path==item.path||item.project.is_some()&&x.provider==item.provider&&x.project==item.project&&x.kind==item.kind&&Path::new(&x.path).parent()==Path::new(&item.path).parent()))).cloned();
  let target=storage::safe_join(&root,&content::location(item))?;
  if target.exists()&&old.as_ref().is_none_or(|x|content::location(x)!=content::location(item)){return Err(BackendError::new("content_conflict","A different file already occupies the destination"));}
  if let Some(old)=old {if old.hash!=item.hash&&(old.provider!=item.provider||old.source=="local"&&old.project.is_none()||old.source!="pack"&&old.project!=item.project){return Err(BackendError::new("content_conflict","Unknown local file would be replaced; remove it explicitly first"));}next.retain(|x|x.id!=old.id);}
  if next.iter().any(|x|x.path==item.path){return Err(BackendError::new("content_conflict","Duplicate destination"));}next.push(item.clone());changed.push(item.clone());
 }
 if changed.is_empty()&&retired.is_empty()&&pack.is_none(){return Ok(state);}
 content::checkpoint(&root,&mut state,if pack.is_some(){"pack_update"}else{"install"})?;if let Some(pack)=pack{state.snapshots.last_mut().unwrap().pack=Some(pack);content::save(&root,&state)?;}
 // Persist all touched paths before applying; rollback can remove newly added files too.
 let old=state.items.clone();for item in &changed{if !state.items.iter().any(|x|x.id==item.id){state.items.push(item.clone());}}content::save(&root,&state)?;
 let result:Result<()>= (||{for item in &old {if !next.iter().any(|x|x.id==item.id){let p=storage::safe_join(&root,&content::location(item))?;if p.is_file(){std::fs::remove_file(p)?;}if !pack_update&&item.source=="pack"&&!state.suppressed_pack_paths.contains(&item.path){state.suppressed_pack_paths.push(item.path.clone());}}}
  for (item,temp) in files {let target=storage::safe_join(&root,&content::location(&item))?;std::fs::create_dir_all(target.parent().unwrap())?;std::fs::rename(temp,target)?;}Ok(())})();
 if let Err(error)=result {let _=content::rollback(b,id);return Err(error);}
 state.items=next;if pack_update{for item in &state.items{if !item.enabled&&item.source=="pack"&&!state.suppressed_pack_paths.contains(&item.path){state.suppressed_pack_paths.push(item.path.clone());}}}let mut changes=changed.clone();let updated=changed.iter().any(|item|old.iter().any(|prev|prev.project.is_some()&&prev.project==item.project&&prev.version!=item.version));
 for item in &mut changes{if let Some(prev)=old.iter().find(|prev|prev.project.is_some()&&prev.project==item.project&&prev.version!=item.version){item.name=format!("{}: {} → {}",item.name,prev.version,item.version);}}
 content::record(b,id,&mut state,if updated{"update"}else{"install"},&changes)?;if !pack_update{content::retain_backups(b,&root,&mut state)?;}content::save(&root,&state)?;Ok(state)
}
pub async fn install(b:Arc<Backend>,id:&str,plan:Plan,job:Arc<Job>)->Result<State>{install_many(b,id,vec![plan],job).await}
pub async fn install_many(b:Arc<Backend>,id:&str,plans:Vec<Plan>,job:Arc<Job>)->Result<State>{
 let i=b.instance(id)?;let state=content::scan(&b,id)?;let root=b.instance_path(id)?;let staging=storage::Staging(root.join(".canary-content/staging").join(uuid::Uuid::new_v4().to_string()));std::fs::create_dir_all(&staging.0)?;
 let mut artifacts=vec![];let mut files=vec![];
 let mut seen=std::collections::HashMap::new();
 for plan in plans {for p in plan.items {
  let key=(p.provider.clone(),p.project.clone(),if p.kind=="datapack"{plan.world.clone()}else{None});
  if let Some(previous)=seen.insert(key,p.version.clone()){if previous!=p.version{return Err(BackendError::new("dependency","Conflicting required dependency versions"));}continue;}let filename=p.file["filename"].as_str().ok_or_else(||BackendError::new("metadata","Filename missing"))?;if filename.contains(['/', '\\']){return Err(BackendError::new("unsafe_path","Filename contains a directory"));}
  let rel=format!("{}/{}",content::folder(&p.kind,plan.world.as_deref())?,filename);storage::safe_join(&root,&rel)?;
  let algorithm=if p.provider=="curseforge"{"sha1"}else{"sha512"};let hash=p.file["hashes"][algorithm].as_str().unwrap_or("").to_owned();if hash.len()!=if algorithm=="sha1"{40}else{128}||!hash.chars().all(|c|c.is_ascii_hexdigit()){return Err(BackendError::new("checksum","Invalid publisher hash"));}
  if state.items.iter().any(|x|x.enabled&&!x.missing&&x.hash==hash&&x.path==rel){continue;}
  let prior=state.items.iter().find(|x|x.provider==p.provider&&x.project.as_ref()==Some(&p.project)&&x.kind==p.kind&&Path::new(&x.path).parent()==Path::new(&rel).parent());
  let temp=staging.0.join(format!("{}-{}",uuid::Uuid::new_v4(),filename));let item=Item{installed:now(),provider:p.provider.clone(),id:uuid::Uuid::new_v4().to_string(),name:p.name,version:p.number,kind:p.kind,path:rel,enabled:p.required||prior.is_none_or(|x|x.enabled),source:p.provider.clone(),hash:hash.clone(),size:p.file["size"].as_u64().ok_or_else(||BackendError::new("metadata","Size missing"))?,project:Some(p.project),provider_version:Some(p.version),icon:p.icon,loader:None,mod_ids:vec![],compatibility:"compatible".into(),missing:false,canary_managed:true,update:None,dependencies:p.dependencies};
  if item.size>512*1024*1024{return Err(BackendError::new("content_archive","Content file exceeds the supported 512 MB inspection limit"));}
  artifacts.push(Artifact{url:p.file["url"].as_str().ok_or_else(||BackendError::new("metadata","Download URL missing"))?.into(),path:temp.clone(),hash:Some(hash),algorithm,size:Some(item.size)});files.push((item,temp));
 }
 }
 download::batch(b.clone(),artifacts,job.clone(),"content").await?;
 for (item,path) in &mut files{item.hash=download::hash_cancellable(path,"sha512",Some(&job.cancel))?;let info=content::inspect(path,&i)?;if info.kind!=item.kind||info.compatibility=="incompatible"{return Err(BackendError::new("content_incompatible","Downloaded archive is incompatible with this instance"));}item.mod_ids=info.mod_ids;item.loader=info.loader;}
 job.critical()?;job.emit("content_apply","running",&i.name);let result=apply(&b,id,state,files)?;job.emit("content","success",&i.name);Ok(result)
}
pub fn import(b:&Backend,id:&str,paths:Vec<String>,world:Option<String>)->Result<State>{import_with_job(b,id,paths,world,None)}
pub fn import_with_job(b:&Backend,id:&str,paths:Vec<String>,world:Option<String>,job:Option<&Job>)->Result<State>{
 use std::io::{Read,Write};use std::sync::atomic::Ordering;
 if let Some(job)=job{job.check()?;job.files.store(paths.len() as u64,Ordering::Relaxed);job.total.store(paths.iter().map(|p|std::fs::metadata(p).map(|m|m.len()).unwrap_or(0)).sum(),Ordering::Relaxed);job.emit("content_import","running","");}
 let i=b.instance(id)?;let root=b.instance_path(id)?;let state=content::scan(b,id)?;let staging=storage::Staging(root.join(".canary-content/staging").join(uuid::Uuid::new_v4().to_string()));std::fs::create_dir_all(&staging.0)?;let mut files=vec![];
 for path in paths {if let Some(job)=job{job.check()?;}let source=Path::new(&path);let info=content::inspect(source,&i)?;if info.compatibility=="incompatible"{return Err(BackendError::new("content_incompatible","Local content is incompatible with this loader or Minecraft version"));}
  if info.kind=="shader"&&!state.items.iter().any(|x|x.enabled&&!x.missing&&x.kind=="mod"&&x.mod_ids.iter().any(|id|matches!(id.as_str(),"iris"|"oculus"|"optifine"|"canvas"))){return Err(BackendError::new("shader_support","Install compatible shader support before importing a shader pack"));}
  let folder=content::folder(&info.kind,world.as_deref())?;if info.kind=="datapack"&&!storage::safe_join(&root,&folder)?.parent().unwrap().join("level.dat").is_file(){return Err(BackendError::new("world_required","Select an existing world"));}
  let hash=download::hash_cancellable(source,"sha512",job.map(|j|j.cancel.as_ref()))?;if state.items.iter().any(|x|x.hash==hash&&!x.missing&&(info.kind!="datapack"||Path::new(&x.path).parent()==Some(Path::new(&folder))))||files.iter().any(|(x,_) : &(Item,std::path::PathBuf)|x.hash==hash&&Path::new(&x.path).parent()==Some(Path::new(&folder))){return Err(BackendError::new("content_duplicate","This file is already installed"));}
  let rel=format!("{folder}/{}",source.file_name().unwrap().to_string_lossy());let temp=staging.0.join(uuid::Uuid::new_v4().to_string());
  let mut input=std::fs::File::open(source)?;let mut output=std::fs::File::create(&temp)?;let mut buffer=[0u8;128*1024];let mut tick=std::time::Instant::now();loop{if let Some(job)=job{job.check()?;}let n=input.read(&mut buffer)?;if n==0{break;}output.write_all(&buffer[..n])?;if let Some(job)=job{job.downloaded.fetch_add(n as u64,Ordering::Relaxed);if tick.elapsed().as_millis()>120{job.emit("content_import","running",source.file_name().unwrap_or_default().to_string_lossy().as_ref());tick=std::time::Instant::now();}}}output.sync_all()?;drop(output);
  if download::hash_cancellable(&temp,"sha512",job.map(|j|j.cancel.as_ref()))?!=hash{return Err(BackendError::new("checksum","Source changed during import"));}
  files.push((Item{installed:now(),provider:"local".into(),id:uuid::Uuid::new_v4().to_string(),name:info.name,version:info.version,kind:info.kind,path:rel,enabled:true,source:"local".into(),hash,size:std::fs::metadata(&temp)?.len(),project:None,provider_version:None,icon:None,loader:info.loader,mod_ids:info.mod_ids,compatibility:info.compatibility,missing:false,canary_managed:true,update:None,dependencies:vec![]},temp));
  if let Some(job)=job{job.completed.fetch_add(1,Ordering::Relaxed);job.emit("content_import","running",source.file_name().unwrap_or_default().to_string_lossy().as_ref());}
 }if let Some(job)=job{job.critical()?;job.emit("content_apply","running",&i.name);}let result=apply(b,id,state,files)?;if let Some(job)=job{job.emit("content","success",&i.name);}Ok(result)
}
pub async fn identify(b:&Backend,id:&str)->Result<State>{let root=b.instance_path(id)?;let mut state=content::scan(b,id)?;let hashes=state.items.iter().filter(|x|!x.missing&&(x.provider=="modrinth"||x.project.is_none())).map(|x|x.hash.clone()).collect::<Vec<_>>();if !hashes.is_empty(){for chunk in hashes.chunks(100){let response=b.client.post(endpoint(&["version_files"])).json(&json!({"hashes":chunk,"algorithm":"sha512"})).send().await?;if !response.status().is_success(){return Err(BackendError::new("content_lookup","Hash lookup failed"));}let data:Value=response.json().await?;for x in &mut state.items {if (x.provider=="modrinth"||x.project.is_none())&&data.get(&x.hash).is_some(){let v=&data[&x.hash];x.provider="modrinth".into();x.project=v["project_id"].as_str().map(str::to_owned);x.provider_version=v["id"].as_str().map(str::to_owned);x.version=v["version_number"].as_str().unwrap_or(&x.version).into();x.dependencies=v["dependencies"].as_array().map(|ds|ds.iter().filter(|d|d["dependency_type"]=="required").filter_map(|d|d["project_id"].as_str().map(str::to_owned)).collect()).unwrap_or_default();}}}}
 content::save(&root,&state)?;Ok(state)}
pub async fn updates(b:&Backend,id:&str,beta:bool)->Result<State>{let i=b.instance(id)?;let root=b.instance_path(id)?;let mut state=identify(b,id).await?;for item in &mut state.items{if let Some(p)=&item.project{let latest=provider_versions(b,&item.provider,&i,p,&item.kind,beta).await?.into_iter().next();item.update=latest.and_then(|v|v["id"].as_str().map(str::to_owned)).filter(|v|Some(v)!=item.provider_version.as_ref());}}content::save(&root,&state)?;Ok(state)}

pub async fn provider_versions(b:&Backend,provider:&str,i:&Instance,p:&str,kind:&str,beta:bool)->Result<Vec<Value>>{match provider{"modrinth"=>versions(b,i,p,kind,beta).await,"curseforge"=>super::curseforge_content::versions(b,p,kind,&i.minecraft,&i.loader,beta).await,_=>Err(BackendError::new("provider","Unknown content provider"))}}
pub async fn provider_preview(b:&Backend,provider:&str,i:&Instance,p:&str,version:Option<&str>,kind:&str,world:Option<String>,beta:bool)->Result<Plan>{match provider{"modrinth"=>preview(b,i,p,version,kind,world,beta).await,"curseforge"=>super::curseforge_content::preview(b,i,p,version,kind,world,beta).await,_=>Err(BackendError::new("provider","Unknown content provider"))}}
