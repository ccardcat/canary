//! Managed heap policy; recommendation is independent of the physical ceiling.
use super::model::*;
pub fn maximum(total:u64)->u32 { total.saturating_sub(512).min(u32::MAX as u64) as u32 }
pub fn recommendation(total:u64,modded:bool)->u32 {
    let target=if modded{8192}else{4096};
    target.min((total/2) as u32).min(maximum(total)).max(256)
}
pub fn resolve(settings:&Settings,instance:&Instance,total:Option<u64>)->(u32,u32,bool){
    let mode=instance.overrides.memory_mode.as_deref().unwrap_or(if instance.overrides.max_memory.is_some(){"manual"}else{&settings.memory_mode});
    let saved=instance.overrides.max_memory.unwrap_or(settings.max_memory);
    let requested=if mode=="auto"{recommendation(total.unwrap_or(8192),instance.loader!="vanilla"||instance.provider!="vanilla")}else{saved};
    let ceiling=total.map(maximum).unwrap_or(requested).max(256);
    let max=requested.clamp(256,ceiling);
    let min=instance.overrides.min_memory.unwrap_or(settings.min_memory).clamp(128,max.saturating_sub(128).max(128));
    (min,max,requested!=max)
}
pub fn managed_args(args:Vec<String>,min:u32,max:u32)->Vec<String>{
    let mut clean=args.into_iter().filter(|arg|!arg.starts_with("-Xmx")&&!arg.starts_with("-Xms")&&!arg.starts_with("-XX:MaxHeapSize=")&&!arg.starts_with("-XX:InitialHeapSize=")&&!arg.starts_with("-XX:MaxRAMPercentage=")&&!arg.starts_with("-XX:InitialRAMPercentage=")).collect::<Vec<_>>();
    clean.insert(0,format!("-Xmx{max}M"));clean.insert(0,format!("-Xms{min}M"));clean
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn system_ceiling_and_recommendation_are_independent(){
        for gb in [8,16,32,64]{let total=gb*1024;assert_eq!(maximum(total),total as u32-512);assert!(recommendation(total,true)<=total as u32/2);}
        assert!(maximum(64*1024)>48*1024);
    }
    #[test]fn migration_clamps_and_manual_high_heap_is_preserved(){
        let s=Settings{max_memory:49152,..Settings::default()};let i=Instance::default();
        assert_eq!(resolve(&s,&i,Some(65536)),(512,49152,false));
        assert_eq!(resolve(&s,&i,Some(16384)),(512,15872,true));
        let auto=Instance{overrides:Overrides{memory_mode:Some("auto".into()),..Overrides::default()},..i};
        assert_eq!(resolve(&s,&auto,Some(65536)).1,8192);
    }
    #[test]fn generated_heap_has_one_authority(){
        let args=managed_args(vec!["-Xmx32G".into(),"-Xms8G".into(),"-XX:MaxHeapSize=10G".into(),"-XX:MaxRAMPercentage=90".into(),"-Dsafe=true".into()],512,12288);
        assert_eq!(args,vec!["-Xms512M","-Xmx12288M","-Dsafe=true"]);
    }
}
