//! Tao assigns the titlebar (ICON_SMALL) and taskbar (ICON_BIG) independently.
//! Tauri's window icon currently sets only ICON_SMALL.
#[cfg(windows)]
pub fn apply(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use std::{ffi::c_void, ptr};
    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    }
    #[link(name = "user32")]
    extern "system" {
        fn LoadImageW(module: *mut c_void, name: *const u16, kind: u32,
                      width: i32, height: i32, flags: u32) -> *mut c_void;
        fn SendMessageW(window: *mut c_void, message: u32, wparam: usize, lparam: isize) -> isize;
    }
    let hwnd = window.hwnd()?.0;
    // Use the executable's multi-size Canary ICO, rather than a generated bitmap.
    // LR_DEFAULTSIZE selects the system icon size; LR_SHARED keeps the resource
    // alive for the lifetime of the process and must not be passed to DestroyIcon.
    let icon = unsafe {
        LoadImageW(
            GetModuleHandleW(ptr::null()),
            tauri::utils::platform::WINDOWS_APP_ICON_RESOURCE_ID as usize as *const u16,
            1, 0, 0, 0x40 | 0x8000,
        )
    };
    if icon.is_null() {
        return Err(std::io::Error::last_os_error().into());
    }
    unsafe { SendMessageW(hwnd, 0x80, 1, icon as isize); }
    Ok(())
}

#[cfg(not(windows))]
pub fn apply(_: &tauri::WebviewWindow) -> tauri::Result<()> { Ok(()) }
