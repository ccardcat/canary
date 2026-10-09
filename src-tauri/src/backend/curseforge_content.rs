//! Official CurseForge adapter, normalized to Canary's shared project/version domain.
use super::{Backend,model::*,curseforge,content,content_provider::{Plan,Planned}};
use serde_json::{Value,json};
fn numeric(value:&str)->Result<u32>{value.parse().map_err(|_|BackendError::new("provider_project","Invalid CurseForge ID"))}
fn class(kind:&str)->Result<u32>{match kind{"mod"=>Ok(6),"modpack"=>Ok(4471),"resourcepack"=>Ok(12),"shader"=>Ok(6552),"datapack"=>Ok(6945),_=>Err(BackendError::new("provider_unsupported","CurseForge does not expose this content type in Canary"))}}
fn kind(id:u64)->Result<&'static str>{match id{6=>Ok("mod"),4471=>Ok("modpack"),12=>Ok("resourcepack"),6552=>Ok("shader"),6945=>Ok("datapack"),_=>Err(BackendError::new("content_type","Unsupported CurseForge project class"))}}
fn loader_id(loader:&str)->Option<u32>{match loader{"forge"=>Some(1),"fabric"=>Some(4),"quilt"=>Some(5),"neoforge"=>Some(6),_=>None}}
fn tags(v:&Value)->Vec<String>{v["gameVersions"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::to_owned).collect()}
fn loaders(v:&Value)->Vec<String>{tags(v).iter().filter_map(|s|match s.to_lowercase().as_str(){"forge"=>Some("forge"),"fabric"=>Some("fabric"),"quilt"=>Some("quilt"),"neoforge"|"neo forge"=>Some("neoforge"),_=>None}).map(str::to_owned).collect()}
pub fn normalize_project(p:&Value)->Result<Value>{
    let content_type=kind(p["classId"].as_u64().unwrap_or(0))?;
    let files=p["latestFiles"].as_array().cloned().unwrap_or_default();
    let mut versions=files.iter().flat_map(tags).filter(|s|s.starts_with(|c:char|c.is_ascii_digit())).collect::<Vec<_>>();versions.extend(p["latestFilesIndexes"].as_array().into_iter().flatten().filter_map(|i|i["gameVersion"].as_str().map(str::to_owned)));versions.sort();versions.dedup();
    let mut loader_tags=files.iter().flat_map(loaders).collect::<Vec<_>>();loader_tags.sort();loader_tags.dedup();
    let mut categories=loader_tags.clone();categories.extend(p["categories"].as_array().into_iter().flatten().filter_map(|c|c["name"].as_str().map(str::to_owned)));let authors=p["authors"].as_array().into_iter().flatten().filter_map(|a|a["name"].as_str()).collect::<Vec<_>>();
    Ok(json!({"download_allowed":p["allowModDistribution"]!=false&&p["isAvailable"]!=false,"provider":"curseforge","id":p["id"].as_u64().unwrap_or(0).to_string(),"project_id":p["id"].as_u64().unwrap_or(0).to_string(),"slug":p["slug"],"title":p["name"],"description":p["summary"],"icon_url":p["logo"]["url"],"downloads":p["downloadCount"],"author":authors.join(", "),"canary_authors":authors,"project_type":content_type,"categories":categories,"loaders":loader_tags,"game_versions":versions,"versions":versions,"gallery":p["screenshots"].as_array().into_iter().flatten().map(|s|json!({"url":s["url"],"title":s["title"]})).collect::<Vec<_>>(),"updated":p["dateModified"],"published":p["dateCreated"],"date_modified":p["dateModified"],"source_url":p["links"]["sourceUrl"],"issues_url":p["links"]["issuesUrl"],"website_url":p["links"]["websiteUrl"],"followers":0}))
}
pub fn normalize_file(file:&Value,kind:&str)->Value{
    let hash=file["hashes"].as_array().and_then(|a|a.iter().find(|h|h["algo"]==1)).and_then(|h|h["value"].as_str());
    let mut loader_tags=loaders(file);if kind=="datapack"{loader_tags.push("datapack".into());}
    json!({"provider":"curseforge","id":file["id"].as_u64().unwrap_or(0).to_string(),"project_id":file["modId"].as_u64().unwrap_or(0).to_string(),"name":file["displayName"],"version_number":file["displayName"],"version_type":match file["releaseType"].as_u64(){Some(1)=>"release",Some(2)=>"beta",_=>"alpha"},"game_versions":tags(file),"loaders":loader_tags,"date_published":file["fileDate"],"dependencies":file["dependencies"].as_array().into_iter().flatten().map(|d|json!({"project_id":d["modId"].as_u64().unwrap_or(0).to_string(),"version_id":null,"dependency_type":match d["relationType"].as_u64(){Some(3)=>"required",Some(2)=>"optional",Some(5)=>"incompatible",_=>"embedded"}})).collect::<Vec<_>>(),"files":[{"filename":file["fileName"],"url":file["downloadUrl"],"size":file["fileLength"],"hashes":{"sha1":hash},"primary":true}],"changelog":null})
}
pub async fn search(b:&Backend,kind:&str,query:&str,sort:&str,offset:u32,limit:u32,game:&str,loader:&str,category:&str)->Result<Value>{
    let page_size=search_page(offset,limit)?;
    let sort_field=match sort{"relevance"=>1,"downloads"=>6,"updated"=>3,"newest"=>11,_=>return Err(BackendError::new("content_search","Invalid sorting"))};
    let mut fields=vec![("gameId","432".into()),("classId",class(kind)?.to_string()),("searchFilter",query.into()),("sortField",sort_field.to_string()),("sortOrder","desc".into()),("index",offset.to_string()),("pageSize",page_size.to_string())];if !game.is_empty(){fields.push(("gameVersion",game.into()));}if kind=="mod"||kind=="modpack" {if let Some(id)=loader_id(loader){fields.push(("modLoaderType",id.to_string()));}}
    if !category.is_empty(){numeric(category)?;fields.push(("categoryId",category.into()));}
    let response=curseforge::request(b,"mods/search",&fields).await?;let mut hits=response["data"].as_array().ok_or_else(||BackendError::new("metadata","CurseForge search response missing"))?.iter().map(normalize_project).collect::<Result<Vec<_>>>()?;
    for hit in &mut hits{let urls=hit["gallery"].as_array().into_iter().flatten().filter_map(|image|image["url"].as_str()).map(str::to_owned).collect::<Vec<_>>();hit["gallery"]=json!(urls);}
    Ok(json!({"hits":hits,"total_hits":response["pagination"]["totalCount"].as_u64().unwrap_or(0).min(10000),"offset":offset,"limit":limit}))
}
pub async fn detail(b:&Backend,project:&str)->Result<Value>{let id=numeric(project)?;let response=curseforge::project(b,id).await?;let mut p=normalize_project(&response["data"])?;let body=curseforge::request(b,&format!("mods/{id}/description"),&[]).await?;p["body"]=body["data"].clone();p["body_format"]=json!("html");Ok(p)}
pub async fn versions(b:&Backend,project:&str,kind:&str,game:&str,loader:&str,beta:bool)->Result<Vec<Value>>{
    let id=numeric(project)?;let mut out=vec![];let mut index=0;
    loop {let mut query=vec![("index",index.to_string()),("pageSize","50".into())];if !game.is_empty(){query.push(("gameVersion",game.into()));}if matches!(kind,"mod"|"modpack") {if let Some(l)=loader_id(loader){query.push(("modLoaderType",l.to_string()));}}
        let response=curseforge::request(b,&format!("mods/{id}/files"),&query).await?;let files=response["data"].as_array().ok_or_else(||BackendError::new("metadata","CurseForge versions missing"))?;
        out.extend(files.iter().filter(|f|beta||f["releaseType"]==1).map(|f|normalize_file(f,kind)).filter(|v|game.is_empty()||v["game_versions"].as_array().is_some_and(|a|a.iter().any(|s|s==game))).filter(|v|!matches!(kind,"mod"|"modpack")||loader.is_empty()||v["loaders"].as_array().is_some_and(|a|a.iter().any(|s|s==loader))));index+=files.len() as u32;if files.is_empty()||index as u64>=response["pagination"]["totalCount"].as_u64().unwrap_or(index as u64){break;}if index>=10_000{return Err(BackendError::new("metadata","Too many CurseForge file versions"));}
    }
    out.sort_by(|a,b|(b["version_type"]=="release").cmp(&(a["version_type"]=="release")).then_with(||b["date_published"].as_str().cmp(&a["date_published"].as_str())));Ok(out)
}
pub async fn preview(b:&Backend,i:&Instance,project:&str,version:Option<&str>,content_kind:&str,world:Option<String>,beta:bool)->Result<Plan>{
    let root=b.instance_path(&i.id)?;let state=content::scan(b,&i.id)?;
    if content_kind=="datapack"&&!super::storage::safe_join(&root,&content::folder(content_kind,world.as_deref())?)?.parent().unwrap().join("level.dat").is_file(){return Err(BackendError::new("world_required","Select an existing world"));}
    if content_kind=="shader"&&!state.items.iter().any(|x|x.enabled&&!x.missing&&x.mod_ids.iter().any(|id|matches!(id.as_str(),"iris"|"oculus"|"optifine"|"canvas"))){return Err(BackendError::new("shader_support","Install a compatible shader loader first"));}
    let mut pending=vec![(project.to_owned(),version.map(str::to_owned),content_kind.to_owned(),false)];let mut items=vec![];let mut optional=vec![];let mut seen=std::collections::HashMap::new();
    while let Some((pid,vid,content_kind,required))=pending.pop(){if items.len()>=64{return Err(BackendError::new("dependency","Dependency graph exceeds 64 projects"));}let id=numeric(&pid)?;let detail=curseforge::project(b,id).await?;let detail=&detail["data"];if kind(detail["classId"].as_u64().unwrap_or(0))?!=content_kind{return Err(BackendError::new("content_type","Project content type does not match"));}if detail["allowModDistribution"]==false||detail["isAvailable"]==false{return Err(BackendError::new("manual_download_required","The author disabled third-party downloads"));}
        let v=if let Some(file)=vid{let f=curseforge::request(b,&format!("mods/{id}/files/{}",numeric(&file)?),&[]).await?;if f["data"]["modId"].as_u64()!=Some(id as u64){return Err(BackendError::new("metadata","CurseForge project/file mismatch"));}normalize_file(&f["data"],&content_kind)}else{versions(b,&pid,&content_kind,&i.minecraft,&i.loader,beta).await?.into_iter().next().ok_or_else(||BackendError::new("content_incompatible","No compatible CurseForge release for this instance"))?};
        if !super::content_provider::compatible(&v,i,&content_kind){return Err(BackendError::new("content_incompatible","CurseForge file does not support this Minecraft version and loader"));}
        let vid=v["id"].as_str().unwrap_or("").to_owned();if let Some(prior)=seen.insert(pid.clone(),vid.clone()){if prior!=vid{return Err(BackendError::new("dependency","Conflicting required dependencies"));}continue;}
        let mut deps=vec![];for dep in v["dependencies"].as_array().into_iter().flatten(){let dp=dep["project_id"].as_str().unwrap_or("").to_owned();match dep["dependency_type"].as_str(){Some("required")=>{let p=curseforge::project(b,numeric(&dp)?).await?;let dk=kind(p["data"]["classId"].as_u64().unwrap_or(0))?;deps.push(dp.clone());pending.push((dp,None,dk.into(),true));},Some("optional")=>optional.push(dp),Some("incompatible")=>{if state.items.iter().any(|x|x.enabled&&x.provider=="curseforge"&&x.project.as_ref()==Some(&dp)){return Err(BackendError::new("dependency","An installed CurseForge project is declared incompatible"));}},_=>{}}}
        let file=v["files"][0].clone();if file["url"].as_str().filter(|u|!u.is_empty()).is_none(){return Err(BackendError::new("manual_download_required","The author does not permit API downloads for this file. Download it from the author's official page and import it manually."));}
        if file["hashes"]["sha1"].as_str().is_none(){return Err(BackendError::new("checksum","Publisher SHA-1 missing"));}
        items.push(Planned{provider:"curseforge".into(),project:pid,version:vid,name:detail["name"].as_str().unwrap_or("Project").into(),number:v["version_number"].as_str().unwrap_or("").into(),kind:content_kind,icon:detail["logo"]["url"].as_str().map(str::to_owned),file,required,dependencies:deps});
    }
    let fingerprint=plan_fingerprint(json!({"items":items,"world":world,"minecraft":i.minecraft,"loader":i.loader}))?;Ok(Plan{items,optional,world,fingerprint})
}
#[cfg(test)]mod tests{use super::*;#[test]fn normalized_file_keeps_restriction_and_provider(){let f=normalize_file(&json!({"id":2,"modId":1,"fileName":"test.jar","downloadUrl":null,"releaseType":1,"gameVersions":["1.21.1","Fabric"],"hashes":[{"algo":1,"value":"abc"}]}),"mod");assert_eq!(f["provider"],"curseforge");assert!(f["files"][0]["url"].is_null());assert_eq!(f["loaders"][0],"fabric");}}

// Authorization tickets can rotate between review and installation. Content
// identity, checksums, filenames, sizes and destination still define approval.
fn plan_fingerprint(mut value:Value)->Result<String>{
 if let Some(items)=value["items"].as_array_mut(){for item in items{
  if let Some(raw)=item["file"]["url"].as_str(){if let Ok(mut url)=reqwest::Url::parse(raw){
   if url.path()==format!("/v1/download/{}/{}",item["project"].as_str().unwrap_or(""),item["version"].as_str().unwrap_or(""))&&url.query_pairs().all(|(k,_)|k=="ticket"){url.set_query(None);item["file"]["url"]=json!(url.as_str());}
  }}
 }}
 use sha2::Digest;Ok(crate::backend::download::hex(sha2::Sha256::digest(serde_json::to_vec(&value)?)))
}
#[cfg(test)]mod gateway_tests {
 use super::*;
 #[test]fn rotating_ticket_preserves_approval_but_changed_hash_does_not(){
  let mut plan=json!({"items":[{"project":"1","version":"2","file":{"url":"https://gateway.example/v1/download/1/2?ticket=old","hashes":{"sha1":"original"},"filename":"mod.jar","size":10}}]});
  let approved=plan_fingerprint(plan.clone()).unwrap();plan["items"][0]["file"]["url"]=json!("https://gateway.example/v1/download/1/2?ticket=new");
  assert_eq!(approved,plan_fingerprint(plan.clone()).unwrap());plan["items"][0]["file"]["hashes"]["sha1"]=json!("changed");assert_ne!(approved,plan_fingerprint(plan).unwrap());
 }
}

pub async fn filters(b:&Backend,content_kind:&str)->Result<Value>{
 let class=class(content_kind)?;
 let categories=curseforge::request(b,"categories",&[("gameId","432".into()),("classId",class.to_string())]).await?;
 let versions=curseforge::request(b,"minecraft/version",&[("sortDescending","true".into())]).await?;
 Ok(json!({"categories":categories["data"].as_array().into_iter().flatten().filter(|c|c["gameId"]==432&&c["classId"].as_u64()==Some(class as u64)&&c["isClass"]!=true).filter_map(|c|Some(json!({"id":c["id"].as_u64()?.to_string(),"name":c["name"].as_str()?}))).collect::<Vec<_>>(),"versions":versions["data"].as_array().into_iter().flatten().filter(|v|v["approved"]!=false).filter_map(|v|v["versionString"].as_str()).collect::<Vec<_>>()}))
}

#[cfg(test)]mod live_gateway_tests{
 use super::*;use std::sync::{Arc,atomic::AtomicBool};
 #[tokio::test]
 #[ignore="Requires deployed, publisher-approved Canary gateway; installs real permitted content in a disposable instance"]
 async fn real_gateway_mod_install(){
  assert_eq!(std::env::var("CANARY_CURSEFORGE_LIVE_VERIFY").as_deref(),Ok("true"),"Set the explicit live verification flag only after publisher confirmation and deployment");
  let root=std::env::temp_dir().join(format!("canary-cf-live-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root).unwrap());
  assert!(curseforge::available(&b).await,"Gateway health must confirm actual API access before live installation");
  let dir=b.root.join("instances/live");crate::backend::protected_fs::create_dir_all(&dir).unwrap();
  let instance=Instance{id:"live".into(),name:"Canary CF live verification".into(),minecraft:"1.21.1".into(),loader:"fabric".into(),provider:"vanilla".into(),directory:dir.to_string_lossy().into(),..Instance::default()};b.save_instance(&instance).unwrap();
  let hits=search(&b,"mod","Fabric API","relevance",0,5,&instance.minecraft,&instance.loader,"").await.unwrap();
  let hit=hits["hits"].as_array().unwrap().iter().find(|p|p["download_allowed"]==true&&p["title"].as_str().is_some_and(|n|n.eq_ignore_ascii_case("Fabric API"))).expect("A permitted compatible Fabric API result is required");
  let id=hit["project_id"].as_str().unwrap();let plan=preview(&b,&instance,id,None,"mod",None,false).await.unwrap();assert!(!plan.items.is_empty());
  let files=plan.items.iter().map(|p|(p.file["filename"].as_str().unwrap().to_owned(),p.file["hashes"]["sha1"].as_str().unwrap().to_owned())).collect::<Vec<_>>();
  let job=Arc::new(super::super::download::Job::new("cf-live",None,Arc::new(AtomicBool::new(false))));
  let state=super::super::content_provider::install(b.clone(),&instance.id,plan,job).await.unwrap();
  for (name,hash) in files{assert_eq!(super::super::download::hash(&dir.join("mods").join(&name),"sha1").unwrap(),hash);assert!(state.items.iter().any(|i|i.provider=="curseforge"&&i.path.ends_with(&name)));}
  println!("CURSEFORGE_REAL_MOD_INSTALL_PUBLISHER_HASH_AND_INVENTORY_VERIFIED");
 }
}

fn search_page(offset:u32,limit:u32)->Result<u32>{
 if offset>=10000{return Err(BackendError::new("content_search","CurseForge search is limited to 10000 results"));}
 Ok(limit.clamp(1,50).min(10000-offset))
}
#[cfg(test)]mod pagination_tests{
 use super::*;
 #[test]fn final_page_respects_total_publisher_limit(){
  assert_eq!(search_page(9996,12).unwrap(),4);assert_eq!(search_page(0,100).unwrap(),50);assert!(search_page(10000,12).is_err());
 }
}
