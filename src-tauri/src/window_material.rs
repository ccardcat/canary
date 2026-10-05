//! Windows backdrop APIs operate on the actual HWND, never a captured wallpaper.
use crate::backend::model::{BackendError, Result};
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use tauri::window::Color;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Material {
    Solid,
    Transparent,
    Acrylic,
    Mica,
    MicaAlt,
}

#[derive(Serialize)]
pub struct Capabilities {
    platform: &'static str,
    build: u32,
    supported: Vec<Material>,
}

fn supported(windows: bool, build: u32) -> Vec<Material> {
    let mut modes = vec![Material::Solid];
    if windows && build >= 10240 {
        modes.push(Material::Transparent);
    }
    if windows && build >= 17763 {
        modes.push(Material::Acrylic);
    }
    if windows && build >= 22000 {
        modes.push(Material::Mica);
    }
    if windows && build >= 22621 {
        modes.push(Material::MicaAlt);
    }
    modes
}

#[cfg(windows)]
fn windows_build() -> u32 {
    #[repr(C)]
    struct Version {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        service_pack: [u16; 128],
    }
    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(version: *mut Version) -> i32;
    }
    let mut v = Version {
        size: std::mem::size_of::<Version>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform: 0,
        service_pack: [0; 128],
    };
    // A version manifest is not required by RtlGetVersion.
    if unsafe { RtlGetVersion(&mut v) } == 0 && v.major >= 10 {
        v.build
    } else {
        0
    }
}
#[cfg(not(windows))]
fn windows_build() -> u32 {
    0
}

#[tauri::command]
pub fn window_material_capabilities() -> Capabilities {
    let build = windows_build();
    Capabilities {
        platform: std::env::consts::OS,
        build,
        supported: supported(cfg!(windows), build),
    }
}

fn candidates(requested: Material, fullscreen: bool) -> Vec<Material> {
    use Material::*;
    // Use a transient backdrop while borderless fullscreen is active. Restore Mica on exit.
    match requested {
        MicaAlt if !fullscreen => vec![MicaAlt, Mica, Acrylic, Transparent, Solid],
        Mica if !fullscreen => vec![Mica, Acrylic, Transparent, Solid],
        MicaAlt | Mica | Acrylic => vec![Acrylic, Transparent, Solid],
        Transparent => vec![Transparent, Solid],
        Solid => vec![Solid],
    }
}

#[cfg(windows)]
fn clear(window: &tauri::WebviewWindow) {
    let _ = window_vibrancy::clear_acrylic(window);
    let _ = window_vibrancy::clear_mica(window);
    let _ = window_vibrancy::clear_tabbed(window);
}
#[cfg(not(windows))]
fn clear(_: &tauri::WebviewWindow) {}

#[cfg(windows)]
fn native(
    window: &tauri::WebviewWindow,
    mode: Material,
    light: bool,
    color: (u8, u8, u8, u8),
) -> std::result::Result<(), String> {
    match mode {
        Material::Acrylic => window_vibrancy::apply_acrylic(window, Some(color)),
        Material::Mica => window_vibrancy::apply_mica(window, Some(!light)),
        Material::MicaAlt => window_vibrancy::apply_tabbed(window, Some(!light)),
        _ => return Ok(()),
    }
    .map_err(|e| e.to_string())
}
#[cfg(not(windows))]
fn native(
    _: &tauri::WebviewWindow,
    _: Material,
    _: bool,
    _: (u8, u8, u8, u8),
) -> std::result::Result<(), String> {
    Ok(())
}

#[derive(Serialize)]
pub struct Applied {
    requested: Material,
    actual: Material,
    fallback: bool,
    reason: Option<&'static str>,
}

#[tauri::command]
pub fn apply_window_material(
    window: tauri::WebviewWindow,
    requested: Material,
    theme: String,
    tint: String,
    transparency: u8,
) -> Result<Applied> {
    if !matches!(theme.as_str(), "light" | "dark" | "amoled")
        || !matches!(tint.as_str(), "neutral" | "theme" | "strong")
        || transparency > 100
    {
        return Err(BackendError::new(
            "window_material",
            "Invalid window material settings",
        ));
    }
    let caps = window_material_capabilities();
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let light = theme == "light";
    let base = if light {
        (245, 247, 249)
    } else if theme == "amoled" {
        (2, 3, 4)
    } else {
        (23, 27, 31)
    };
    let alpha = ((100 - transparency) as f32 * 2.55).round() as u8;
    let tint_alpha = match tint.as_str() {
        "neutral" => alpha.min(100),
        "strong" => alpha.max(150),
        _ => alpha,
    };
    let mut failed = false;
    for actual in candidates(requested, fullscreen)
        .into_iter()
        .filter(|m| caps.supported.contains(m))
    {
        clear(&window);
        #[cfg(windows)]
        let color = if actual == Material::Solid {
            Color(base.0, base.1, base.2, 255)
        } else {
            Color(0, 0, 0, 0)
        };
        #[cfg(windows)]
        if window.set_background_color(Some(color)).is_err() {
            failed = true;
            continue;
        }
        if native(&window, actual, light, (base.0, base.1, base.2, tint_alpha)).is_err() {
            failed = true;
            continue;
        }
        let fallback = actual != requested;
        let reason = if !fallback {
            None
        } else if failed {
            Some("native-effect-failed")
        } else if fullscreen && matches!(requested, Material::Mica | Material::MicaAlt) {
            Some("fullscreen-fallback")
        } else {
            Some("unsupported-platform-version")
        };
        return Ok(Applied {
            requested,
            actual,
            fallback,
            reason,
        });
    }
    // Keep the frontend opaque if even restoring the native background failed.
    clear(&window);
    Err(BackendError::new(
        "window_material",
        "Could not apply the native material; use the solid surface",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_modes_are_gated_by_the_real_windows_build() {
        assert_eq!(supported(false, 26100), vec![Material::Solid]);
        assert!(!supported(true, 19045).contains(&Material::Mica));
        assert!(supported(true, 22000).contains(&Material::Mica));
        assert!(!supported(true, 22000).contains(&Material::MicaAlt));
        assert!(supported(true, 22621).contains(&Material::MicaAlt));
    }
    #[test]
    fn fullscreen_fallback_is_reversible() {
        assert_eq!(candidates(Material::MicaAlt, true)[0], Material::Acrylic);
        assert_eq!(candidates(Material::MicaAlt, false)[0], Material::MicaAlt);
        assert_eq!(
            candidates(Material::Transparent, false).last(),
            Some(&Material::Solid)
        );
    }
}
