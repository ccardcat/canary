# Settings organization

Settings now use three expandable groups. Appearance contains theme/colors,
surfaces/transparency, wallpaper, sidebar, interface/cards, typography, effects,
window controls/material and graphics quality. Game & files contains Minecraft,
downloads, storage and backups/logs. Launcher contains accounts, Discord,
language and About.

Search matches section names, descriptions and localized keywords. Results show
their group and a short explanation; selecting one expands its navigation branch.
Collapsed branches are inert and excluded from the modal focus trap. Expansion
uses CSS grid transitions and respects both reduced-motion preferences.

Existing controls retain their preference fields, IPC commands and save behavior.
The former combined Canary page was redundant; its controls remain available in
the appropriate game/file sections. Materials and layout presets are unchanged.

The sidebar has one dedicated page for side, attached/floating layout, compact
mode, wallpaper treatment and material. New preferences provide picture, theme
color or custom solid color backgrounds, plus solid-background opacity. Custom
color ink and the brand image follow the chosen color's brightness. These text
tokens are scoped to the sidebar. Choosing a solid background unlinks wallpaper
selection, leaving the launcher background intact. Re-enabling a picture from
Solid material changes only the sidebar material and preserves other categories.
Old preferences default to the existing picture behavior; new keys are validated
and opacity is bounded. Focus/low-quality/reduced-transparency fallback modes
continue to use an opaque sheet.

Verification: frontend production build and TypeScript 6.0.3 compatibility check
passed (the installed TypeScript 7 executable is unsupported by this environment).
21 page-free tests passed, including four sidebar preference/ink/token tests.
Eight DOM scenarios exercised actual settings/provider components, including
branch expansion, search, independent solid color, picture restoration, compact
mode, unchanged runtime Save payload and all nine visual pages in Russian.
Existing browser tests were updated for moved controls and collapsed groups;
four new browser scenarios cover persistence, navigation, narrow layouts and
reduced motion. All 216 tests were discovered successfully. Real Chromium and
native WebView visual execution remain unverified here: Chromium exits with
SIGTRAP in this environment, and native desktop prerequisites are unavailable.
