use super::{Backend,model::*,storage};
use sha2::{Digest,Sha256};
pub async fn cache(backend:&Backend,instance:&mut Instance)->Result<()> {
    let Some(url)=instance.icon.as_ref().filter(|s|s.starts_with("https://")) else{return Ok(())};
    let extension=reqwest::Url::parse(url).ok().and_then(|u|u.path().rsplit('.').next().map(str::to_ascii_lowercase)).filter(|e|matches!(e.as_str(),"png"|"jpg"|"jpeg"|"webp"|"svg")).unwrap_or("png".into());
    let path=backend.root.join("cache/icons").join(format!("{:x}.{extension}",Sha256::digest(url.as_bytes())));
    if !path.is_file(){
        let mut response=backend.client.get(url).timeout(std::time::Duration::from_secs(8)).send().await?.error_for_status()?;
        if response.url().scheme()!="https"||response.content_length().is_some_and(|s|s>4*1024*1024){return Err(BackendError::new("artwork","Invalid image source or size"));}
        let mut bytes=vec![];while let Some(chunk)=response.chunk().await?{if bytes.len()+chunk.len()>4*1024*1024{return Err(BackendError::new("artwork","Image too large"));}bytes.extend_from_slice(&chunk);}
        if bytes.is_empty(){return Err(BackendError::new("artwork","Image is empty"));}
        std::fs::create_dir_all(path.parent().unwrap())?;let temporary=path.with_extension(format!("{}.tmp",uuid::Uuid::new_v4()));std::fs::write(&temporary,bytes)?;
        if let Err(error)=std::fs::rename(&temporary,&path){let _=std::fs::remove_file(temporary);return Err(error.into());}
    }
    instance.icon=Some(path.to_string_lossy().into());Ok(())
}
pub fn screenshot(backend:&Backend,id:&str,name:&str)->Result<std::path::PathBuf>{
    let dir=backend.instance_path(id)?;let path=storage::safe_join(&dir.join("screenshots"),name)?;
    if !path.is_file()||!path.extension().is_some_and(|e|matches!(e.to_string_lossy().to_ascii_lowercase().as_str(),"png"|"jpg"|"jpeg")){return Err(BackendError::new("screenshot","Screenshot not found"));}Ok(path)
}
