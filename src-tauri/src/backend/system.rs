use super::model::*;
#[cfg(windows)]
pub fn memory_mb()->Option<u64> {
    #[repr(C)] struct Memory {length:u32,load:u32,total:u64,available:u64,page_total:u64,page_available:u64,virtual_total:u64,virtual_available:u64,extended:u64}
    #[link(name="kernel32")] unsafe extern "system" {fn GlobalMemoryStatusEx(value:*mut Memory)->i32;}
    let mut value=Memory{length:std::mem::size_of::<Memory>() as u32,load:0,total:0,available:0,page_total:0,page_available:0,virtual_total:0,virtual_available:0,extended:0};
    // Win32 fills exactly MEMORYSTATUSEX; no pointers are retained.
    if unsafe{GlobalMemoryStatusEx(&mut value)}!=0{Some(value.total/1_048_576)}else{None}
}
#[cfg(not(windows))]pub fn memory_mb()->Option<u64>{let text=crate::backend::protected_fs::read_to_string("/proc/meminfo").ok()?;text.lines().find(|l|l.starts_with("MemTotal:")).and_then(|l|l.split_whitespace().nth(1))?.parse::<u64>().ok().map(|kb|kb/1024)}
pub fn validate_memory(min:u32,max:u32)->Result<()> {
    if min<128||max<=min||max>1_048_576||memory_mb().is_some_and(|total|max as u64>total){return Err(BackendError::new("memory","RAM allocation must be positive, ordered and fit within physical memory"));}Ok(())
}
pub fn os_version()->String {
    #[cfg(windows)] {
        #[repr(C)]struct Version{size:u32,major:u32,minor:u32,build:u32,platform:u32,service:[u16;128]}
        #[link(name="ntdll")]unsafe extern "system"{fn RtlGetVersion(value:*mut Version)->i32;}
        let mut v=Version{size:std::mem::size_of::<Version>() as u32,major:0,minor:0,build:0,platform:0,service:[0;128]};
        if unsafe{RtlGetVersion(&mut v)}==0{return format!("{}.{}.{}",v.major,v.minor,v.build);}
    }
    String::new()
}
#[cfg(test)]mod tests {use super::*;#[test]fn rejects_invalid_allocations(){assert!(validate_memory(0,4096).is_err());assert!(validate_memory(512,512).is_err());assert!(validate_memory(4096,512).is_err());assert!(validate_memory(128,256).is_ok());}}
