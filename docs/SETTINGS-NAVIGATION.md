# Settings organization

Settings now use three expandable groups. Appearance contains theme/colors,
surfaces/transparency, wallpaper, sidebar, interface/cards, typography, effects,
window controls/material and graphics quality. Game & files contains Minecraft,
downloads, storage and backups/logs. Launcher contains accounts, Discord,
language and About.

Search matches section names, descriptions and localized keywords. Results show
their group and a short explanation; selecting one expands its navigation branch.
Collapsed branches are inert and excluded from the modal focus trap. Expansion
animates measured heights and a short slide and respects both reduced-motion preferences.

Retained controls keep their preference fields, IPC commands and save behavior.
The former combined Canary page was redundant; its controls remain available in
the appropriate game/file sections. Materials and layout presets are unchanged.

The sidebar has one dedicated page for side, attached/floating layout, compact
mode, wallpaper treatment and material. New preferences provide picture, theme
color or custom solid color backgrounds, plus solid-background opacity. Custom
color ink and the brand image follow the chosen color's brightness. These text
tokens are scoped to the sidebar. Each background is selected independently,
leaving the other area intact. Re-enabling a picture from
Solid material changes only the sidebar material and preserves other categories.
Old preferences default to the existing picture behavior; new keys are validated
and opacity is bounded. Focus/low-quality/reduced-transparency fallback modes
continue to use an opaque sheet.

The shared-wallpaper switch has been removed. Legacy `linked` values are ignored
and dropped when preferences are normalized, while both saved image selections
are preserved. Gallery buttons show only thumbnails; accessible names and hover
tooltips retain the wallpaper names. Custom imports target the current page.
Backend `both` records remain supported for images imported separately into both
areas and for older installations; they do not synchronize image selections.

To import a personal background, open Appearance → Background (launcher) or
Appearance → Sidebar → Picture, then Choose custom image. The native picker accepts
PNG, JPEG and WebP files up to 32 MB. Imported copies and thumbnails are managed by
the launcher, so moving or deleting the original file does not remove the import.

Verification: frontend production build and TypeScript 6.0.3 compatibility check
passed (the installed TypeScript 7 executable is unsupported by this environment).
24 page-free tests passed, including four sidebar preference/ink/token tests.
Twelve DOM scenarios exercised actual settings/provider components, including
branch expansion, search, independent solid color, picture restoration, compact
mode, unchanged runtime Save payload, all nine visual pages in Russian, removal
of legacy synchronization, caption-free galleries and separate import targets.
Existing browser tests were updated for moved controls and collapsed groups;
four new browser scenarios cover persistence, navigation, narrow layouts and
reduced motion. All 221 tests were discovered successfully. Real Chromium and
native WebView visual execution remain unverified here: Chromium exits with
SIGTRAP in this environment, and native desktop prerequisites are unavailable.
