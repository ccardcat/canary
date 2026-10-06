use super::{Backend,download::{self,Artifact,Job},model::*,storage};
use serde_json::{Value,json};
use std::{collections::{HashMap,HashSet},path::PathBuf,sync::Arc};
pub fn os_name()->&'static str{if cfg!(windows){"windows"}else if cfg!(target_os="macos"){"osx"}else{"linux"}}
pub const MANIFEST:&str="https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
#[derive(Clone,serde::Serialize,serde::Deserialize)]
pub struct Prepared {#[serde(default)]pub platform:String,pub metadata:Value,pub classpath:Vec<String>,pub natives:String,pub assets:String,pub asset_index:String,pub java_major:u32,pub logging:Option<String>,#[serde(default)]pub files:Vec<(String,u64)>}
pub fn allowed(value:&Value)->bool {
    let Some(rules)=value["rules"].as_array()else{return true};if rules.is_empty(){return true;}
    let mut allow=false;
    for rule in rules {
        if let Some(os)=rule.get("os") {
            if os["name"].as_str().is_some_and(|n|n!=os_name()){continue;}
            if os["arch"].as_str().is_some_and(|arch|if cfg!(target_arch="aarch64"){!matches!(arch,"aarch64"|"arm64")}else{!matches!(arch,"amd64"|"x86_64"|"x64")}){continue;}
            if let Some(pattern)=os["version"].as_str(){if !regex::Regex::new(pattern).is_ok_and(|r|r.is_match(&super::system::os_version())){continue;}}
        }
        if let Some(features)=rule["features"].as_object(){if features.iter().any(|(key,v)|v.as_bool().unwrap_or(false)!=(key=="has_custom_resolution")){continue;}}
        allow=rule["action"]=="allow";
    }allow
}
pub fn arguments(metadata:&Value,kind:&str)->Vec<String>{
    let mut args=vec![];if let Some(entries)=metadata["arguments"][kind].as_array(){for entry in entries {
        if let Some(s)=entry.as_str(){args.push(s.into());}else if allowed(entry){match &entry["value"]{Value::String(s)=>args.push(s.clone()),Value::Array(values)=>args.extend(values.iter().filter_map(|v|v.as_str().map(str::to_owned))),_=>{}}}
    }}args
}
pub fn substitute(args:Vec<String>,values:&HashMap<String,String>)->Result<Vec<String>> {
    args.into_iter().map(|mut arg|{for (key,value)in values{arg=arg.replace(&format!("${{{key}}}"),value);}if arg.contains("${"){Err(BackendError::new("arguments","Unresolved launch placeholder in version metadata"))}else{Ok(arg)}}).collect()
}
pub fn merge(parent:&Value,child:&Value)->Value {
    let mut result=parent.clone();if let Some(fields)=child.as_object(){for(key,value)in fields{
        match key.as_str(){"libraries"=>{let mut libs=result[key].as_array().cloned().unwrap_or_default();libs.extend(value.as_array().cloned().unwrap_or_default());result[key]=json!(libs)},"arguments"=>{for kind in ["jvm","game"]{let mut args=result[key][kind].as_array().cloned().unwrap_or_default();args.extend(value[kind].as_array().cloned().unwrap_or_default());result[key][kind]=json!(args)}},_=>result[key]=value.clone()}
    }}result
}
pub async fn manifest(backend:&Backend)->Result<Value> {
    let cache=backend.root.join("cache/manifest.json");match download::json(backend,MANIFEST).await {Ok(value)=>{storage::write_json(&cache,&value)?;Ok(value)},Err(error)=>if cache.is_file(){Ok(serde_json::from_slice(&std::fs::read(cache)?)?)}else{Err(error)}}
}
fn artifact(download:&Value,path:PathBuf)->Result<Artifact>{
    let published=download["sha1"].as_str().filter(|h|h.len()==40).map(str::to_owned);
    let algorithm=if published.is_some(){"sha1"}else{"sha256"};let hash=published.or_else(||std::fs::read_to_string(path.with_extension("sha256")).ok());
    Ok(Artifact{url:download["url"].as_str().unwrap_or_default().into(),path,hash,algorithm,size:download["size"].as_u64()})
}
pub async fn prepare(backend:Arc<Backend>,instance:&Instance,job:Arc<Job>,deep:bool)->Result<Prepared>{
    job.check()?;job.emit("minecraft","running",&instance.minecraft);
    super::modpacks::verify(backend.clone(),instance,job.clone(),deep).await?;
    let dir=backend.instance_path(&instance.id)?;let prepared_path=dir.join("runtime.json");
    if !deep&&prepared_path.is_file(){let cached:Prepared=serde_json::from_slice(&std::fs::read(&prepared_path)?)?;
        if cached.platform==os_name()&&!cached.files.is_empty()&&cached.files.iter().all(|(p,size)|std::fs::metadata(p).is_ok_and(|m|m.len()==*size))&&cached.classpath.iter().all(|p|std::path::Path::new(p).is_file())&&std::path::Path::new(&cached.natives).is_dir(){return Ok(cached);}}
    let versions=download::cancellable(&job,manifest(&backend)).await?;let version=versions["versions"].as_array().and_then(|list|list.iter().find(|v|v["id"]==instance.minecraft)).ok_or_else(||BackendError::new("minecraft_version","Minecraft version not found"))?;
    let metadata_path=storage::safe_join(&backend.root.join("cache/versions"),&format!("{}.json",instance.minecraft))?;
    let metadata_artifact=artifact(version,metadata_path.clone())?;
    download::batch(backend.clone(),vec![metadata_artifact],job.clone(),"minecraft").await?;
    let mut metadata:Value=serde_json::from_slice(&std::fs::read(metadata_path)?)?;
    let base_id=metadata["id"].as_str().ok_or_else(||BackendError::new("metadata","Minecraft metadata has no ID"))?.to_owned();
    let client_path=storage::safe_join(&backend.root.join("cache/versions"),&format!("{base_id}.jar"))?;
    let client=artifact(&metadata["downloads"]["client"],client_path.clone())?;
    if matches!(instance.loader.as_str(),"forge"|"neoforge"){
        let child=super::loaders::profile(backend.clone(),instance,&metadata,&client,job.clone(),deep).await?;metadata=merge(&metadata,&child);
    }else if instance.loader!="vanilla" {
        let host=match instance.loader.as_str(){"fabric"=>"https://meta.fabricmc.net/v2","quilt"=>"https://meta.quiltmc.org/v3",_=>return Err(BackendError::new("loader_unsupported","Unknown mod loader"))};
        let exact=instance.loader_version.as_ref().ok_or_else(||BackendError::new("loader","Missing loader version"))?;
        let mut profile=reqwest::Url::parse(host).unwrap();profile.path_segments_mut().unwrap().extend(["versions","loader",&instance.minecraft,exact,"profile","json"]);
        let child=download::cancellable(&job,download::json(&backend,profile.as_str())).await?;
        if child["inheritsFrom"].as_str().is_some_and(|id|id!=instance.minecraft){return Err(BackendError::new("loader","Loader profile targets a different Minecraft version"));}
        metadata=merge(&metadata,&child);
    }
    let cache=backend.root.join("cache");let mut files=vec![client];let mut classpath=vec![];let mut natives=vec![];let mut seen=HashSet::new();
    for lib in metadata["libraries"].as_array().ok_or_else(||BackendError::new("metadata","Minecraft libraries missing"))?{
        if !allowed(lib){continue;}
        if let Some(art)=lib["downloads"].get("artifact") {
            let rel=art["path"].as_str().ok_or_else(||BackendError::new("metadata","Library path missing"))?;
            let path=storage::safe_join(&cache.join("libraries"),rel)?;
            if seen.insert(path.clone()){classpath.push(path.to_string_lossy().into());files.push(artifact(art,path)?);}
        }else if lib["name"].is_string(){
            let coordinate=lib["name"].as_str().unwrap();let parts:Vec<_>=coordinate.split(':').collect();if parts.len()<3||parts.len()>4{return Err(BackendError::new("library","Invalid Maven coordinate"));}
            let suffix=parts.get(3).map(|v|format!("-{v}")).unwrap_or_default();let rel=format!("{}/{}/{}/{}-{}{}.jar",parts[0].replace('.',"/"),parts[1],parts[2],parts[1],parts[2],suffix);
            let base=lib["url"].as_str().unwrap_or("https://libraries.minecraft.net/");let url=format!("{}{rel}",base.trim_end_matches('/').to_owned()+"/");let path=storage::safe_join(&cache.join("libraries"),&rel)?;
            // Fabric metadata does not publish hashes. Versioned Maven artifacts are
            // cached with a local integrity receipt after the first HTTPS download.
            let receipt=path.with_extension("sha256");let expected=std::fs::read_to_string(&receipt).ok();
            if seen.insert(path.clone()){classpath.push(path.to_string_lossy().into());files.push(Artifact{url,path,hash:expected,algorithm:"sha256",size:None});}
        }
        if let Some(classifier)=lib["natives"][os_name()].as_str(){let classifier=classifier.replace("${arch}",if cfg!(target_pointer_width="64"){"64"}else{"32"});
            let data=&lib["downloads"]["classifiers"][classifier];let rel=data["path"].as_str().ok_or_else(||BackendError::new("metadata","Native path missing"))?;let path=storage::safe_join(&cache.join("libraries"),rel)?;
            if seen.insert(path.clone()){files.push(artifact(data,path.clone())?);}natives.push(path);
        }
    }
    classpath.push(client_path.to_string_lossy().into());
    if let Some(log)=metadata["logging"]["client"].get("file"){let id=log["id"].as_str().ok_or_else(||BackendError::new("metadata","Log configuration ID missing"))?;files.push(artifact(log,storage::safe_join(&cache.join("logging"),id)?)?);}
    let mut required:Vec<_>=files.iter().map(|f|f.path.clone()).collect();
    let receipts:Vec<_>=files.iter().filter(|f|f.hash.is_none()).map(|f|f.path.clone()).collect();
    download::batch(backend.clone(),files,job.clone(),"libraries").await?;
    for path in receipts {let copy=path.clone();let cancel=job.cancel.clone();let hash=tokio::task::spawn_blocking(move||download::hash_cancellable(&copy,"sha256",Some(&cancel))).await.map_err(|e|BackendError::new("hash",e.to_string()))??;std::fs::write(path.with_extension("sha256"),hash)?;}
    let native_dir=dir.join("natives");std::fs::create_dir_all(&native_dir)?;
    for path in natives {job.check()?;let target=native_dir.clone();let token=job.clone();tokio::task::spawn_blocking(move||storage::extract_job(&path,&target,Some(&token))).await.map_err(|e|BackendError::new("natives",e.to_string()))??;}
    let index=&metadata["assetIndex"];let index_id=index["id"].as_str().or(metadata["assets"].as_str()).ok_or_else(||BackendError::new("metadata","Asset index missing"))?.to_owned();
    let index_path=storage::safe_join(&cache.join("assets/indexes"),&format!("{index_id}.json"))?;
    download::batch(backend.clone(),vec![artifact(index,index_path.clone())?],job.clone(),"assets").await?;
    required.push(index_path.clone());
    fn native_files(dir:&std::path::Path,out:&mut Vec<PathBuf>)->Result<()> {for entry in std::fs::read_dir(dir)? {let entry=entry?;if entry.file_type()?.is_dir(){native_files(&entry.path(),out)?;}else{out.push(entry.path());}}Ok(())}
    native_files(&native_dir,&mut required)?;
    let asset_index:Value=serde_json::from_slice(&std::fs::read(index_path)?)?;let objects=asset_index["objects"].as_object().ok_or_else(||BackendError::new("metadata","Asset objects missing"))?;
    let mut assets=vec![];let mut hashes=HashSet::new();for item in objects.values(){let hash=item["hash"].as_str().filter(|s|s.len()==40&&s.chars().all(|c|c.is_ascii_hexdigit())).ok_or_else(||BackendError::new("metadata","Invalid asset hash"))?;
        if hashes.insert(hash){assets.push(Artifact{url:format!("https://resources.download.minecraft.net/{}/{hash}",&hash[..2]),path:cache.join("assets/objects").join(&hash[..2]).join(hash),hash:Some(hash.into()),algorithm:"sha1",size:item["size"].as_u64()});}}
    required.extend(assets.iter().map(|f|f.path.clone()));
    download::batch(backend.clone(),assets,job.clone(),"assets").await?;
    // Legacy logical assets must be materialized as well as stored by hash.
    if asset_index["virtual"]==true||asset_index["map_to_resources"]==true {let logical=if asset_index["map_to_resources"]==true{dir.join("resources")}else{cache.join("assets/virtual").join(&index_id)};for(name,item)in objects{job.check()?;let hash=item["hash"].as_str().unwrap();let source=cache.join("assets/objects").join(&hash[..2]).join(hash);let target=storage::safe_join(&logical,name)?;if !target.is_file(){std::fs::create_dir_all(target.parent().unwrap())?;std::fs::copy(source,target)?;}}}
    let logging=if let Some(arg)=metadata["logging"]["client"]["argument"].as_str(){let id=metadata["logging"]["client"]["file"]["id"].as_str().unwrap();Some(arg.replace("${path}",&storage::safe_join(&cache.join("logging"),id)?.to_string_lossy()))}else{None};
    let prepared=Prepared {platform:os_name().into(),java_major:metadata["javaVersion"]["majorVersion"].as_u64().unwrap_or(8) as u32,metadata,natives:native_dir.to_string_lossy().into(),classpath,assets:cache.join("assets").to_string_lossy().into(),asset_index:index_id.into(),logging,files:required.into_iter().map(|p|{let size=std::fs::metadata(&p).map(|m|m.len())?;Ok((p.to_string_lossy().into_owned(),size))}).collect::<Result<Vec<_>>>()?};
    storage::write_json(&prepared_path,&prepared)?;job.check()?;Ok(prepared)
}
#[cfg(test)]mod tests{use super::*;#[test]fn rules_and_placeholders(){assert!(allowed(&json!({})));assert!(allowed(&json!({"rules":[{"action":"allow","os":{"name":os_name()}}]})));assert!(!allowed(&json!({"rules":[{"action":"allow"},{"action":"disallow","os":{"name":os_name()}}]})));let args=arguments(&json!({"arguments":{"game":["--username","${auth_player_name}",{"rules":[{"action":"allow","features":{"is_demo_user":true}}],"value":"--demo"}]}}),"game");assert_eq!(args.len(),2);let values=HashMap::from([("auth_player_name".into(),"Player".into())]);assert_eq!(substitute(args,&values).unwrap(),["--username","Player"]);assert!(substitute(vec!["${missing}".into()],&values).is_err());}#[test]fn loader_merges(){let a=json!({"libraries":[{"name":"a"}],"arguments":{"game":["a"]},"mainClass":"old"});let b=json!({"libraries":[{"name":"b"}],"arguments":{"game":["b"]},"mainClass":"new"});let c=merge(&a,&b);assert_eq!(c["libraries"].as_array().unwrap().len(),2);assert_eq!(c["arguments"]["game"],json!(["a","b"]));assert_eq!(c["mainClass"],"new");}}
