# Финальный проход Canary: реализация и проверка

Дата: 5 октября 2026. Основа: main после `git pull --ff-only`, ecdb756. Изменения внесены в существующие React/Tauri/Rust подсистемы; прежний черновик backend сохранён в отдельной локальной ветке и не включён в main.

## Bugs fixed

Исправлены отсеивание ZIP-версий CurseForge фильтром mrpack, потеря provider при установке из detail, неподдерживаемый CF sort по followers, отображение импортированных обоев через asset URL в WebKit, порядок React providers для нативных обоев, устаревающие результаты backend refresh, отображение реальных экземпляров на Home, повторное использование Windows runtime на Linux, разделитель Java classpath, определение Java и установка JRE на Linux, замена файлов на Windows, потеря резервных метаданных при откате обновления сборки, перенос вспомогательных файлов между дисками, выбор активной копии после миграции. Идентификаторы экземпляров, карточек и новых событий Activity используются как React keys. Ошибки показывают понятное описание, технические данные доступны отдельно через Details.

## Library

Тестовые экземпляры имеют явный `internal` flag и скрыты из Home/Library; пользовательские названия не фильтруются по словам. Редактор привязан к ID экземпляра. Play выделен акцентом, остальные действия спокойнее; статусы Running/Stopping блокируют повторные действия. Playtime хранится в секундах и выводится минутами/часами с русским склонением. Home использует нативный каталог экземпляров.

## Backgrounds

Центральный registry подключает уже находившиеся в репозитории Axolotl Pink, Bees Green, Garden Awakens, Minecraft New Year, Pink Sidebar и Green 2 Sidebar. Явные пары: Dark Blue, Gray, Green, Sakura 1, Sakura 2. Pink/Green 2 независимы; остальные новые основные фоны не получают выдуманных пар. Новые непарные assets обнаруживаются через glob.

Собственный фон: нативный image picker; App/Sidebar/Both; управляемая копия WebP до 3840 px, миниатюра до 320 px, SHA-256 дедупликация, ограничение входа 32 MB и декодирования. Удаляются только импортированные изображения. Настройки выбора, linked/unlinked, эффектов, позиции и масштаба сохраняются; fullscreen убирает зазор titlebar. Нативный file picker реально импортировал PNG; фон появился в Settings после перезапуска. Прямой asset URL декодирования WebKit заменён управляемым Blob URL с освобождением памяти; нативно подтверждено отображение фона и sidebar, включая F11. Автоматический тест проверяет импорт, объединение targets, удаление исходника, повторное открытие и удаление управляемых копий.

## Cursor

Добавлены компактные CUR для всех 17 существующих ролей. Выбран исходный lossless frame 32×32, его hotspot сохранён; оригинальные CUR/ANI не изменены. Busy/Working остаются статическими. CSS подключает compact assets. Повторная подготовка: `python3 scripts/prepare-desktop-assets.py`.

## Windows icon

Источник: существующая прозрачная `public/branding/canary-bird-white.png`; без надписи CANARY. Обновлены Tauri desktop icons; ICO содержит 16/24/32/48/64/128/256 px. Изображение птицы визуально проверено. Taskbar/Alt+Tab и DPI 100/125/150% требуют интерактивной Windows-среды; Linux-скриншот не считается такой проверкой.

## Storage

Settings показывает путь, used/free space, Copy/Open/Choose folder и разбивку Instances/Cache/Java/Logs/Total без двойного учёта логов. Clear cache требует подтверждения, блокируется при играх/операциях и затрагивает только отдельную управляемую папку повторно загружаемых файлов; worlds, Java и accounts сохраняются. Папка экземпляров не может пересекаться с внутренними cache/Java/logs/temp/wallpapers. Подсчёт размера не следует symlinks, в том числе штатным ссылкам внутри JRE. Можно оставить старые экземпляры на месте либо перенести все. Запущенные игры и операции блокируют смену хранилища. Копирование идёт во staging на целевом диске, каждый файл проверяется SHA-256; пути переключаются после проверки и сохранения settings, исходники удаляются после commit. Ошибка удаления оставляет проверенные исходные копии и показывает пути. Отключённый диск сохраняет экземпляры в каталоге со статусом unavailable, Play не подменяет папку новой пустой.

Нативно проверен перенос Minecraft в `/workspace/.qa/final-pass/Игры Canary/Сборки` и повторный запуск из этого пути. Cache/Java остаются в app data независимо от папки экземпляров: экземпляры на D:, cache/Java на C: поддерживаются архитектурой. Дополнительные отдельные UI-пути cache/Java/logs не добавлялись: в ТЗ это опционально. Проверены сохранение world markers, restart, конфликт назначения и отключение/возврат диска; физического второго диска здесь нет.

## Settings

Сохранены Java auto/manual/detect/check/install, RAM, JVM/game arguments, разрешение, download concurrency, snapshots, игровой fullscreen и внешний вид. Добавлены папка экземпляров/миграция, default account с режимом last used и приоритетом per-instance override, предупреждение при выделении ≥80% физической RAM, наследование игрового fullscreen для экземпляра, restore points и retention 1–32, logs 7/30/90 дней/forever и cleanup, автоматическая проверка обновлений сборок, native import/export JSON, reset игровых настроек без удаления данных/аккаунтов/папок. Экспорт не включает учётные записи, credentials и локальные storage paths. Ограничение скорости, пресеты, поиск settings и индивидуальные эффекты каждого wallpaper оставлены как опциональные пункты.

## Fullscreen

F11 вызывает настоящий `setFullscreen`; переходы сериализуются и ждут подтверждения ОС. Выход восстанавливает размер/позицию либо прежний maximized. Escape сначала обслуживает открытый dialog/popover. Launcher fullscreen не меняет игровой fullscreen. Проверены браузерный native API contract и фактический Tauri fullscreen на Linux; titlebar исчезает без верхней полосы.

## Microsoft

Authorization Code + PKCE S256, системный браузер, consumer Microsoft account, loopback `http://localhost:<port>`, случайный state, ограниченный listener, cancellation/timeout/cleanup. Отмена прерывает также текущие запросы token/Xbox/Minecraft, а не только ожидание callback. Далее Xbox Live → XSTS → Minecraft token → entitlements → Java profile. Client ID e96175e4-2fd4-43ec-8911-8335f7783ebd; при необходимости override `CANARY_MICROSOFT_CLIENT_ID`. Client Secret не используется. Refresh token хранится только в OS keyring; Minecraft access token не сохраняется в JSON и не возвращается frontend.

Launch использует реальное имя, UUID, Minecraft token и `user_type=msa`; Local fallback и Ely.by agent для Microsoft отсутствуют. Реальный TCP listener протестирован на поддельном state, правильном callback, cancellation и закрытии порта; native begin/cancel проверены. Полный вход, entitlement, online gameplay и исчезновение offline warning НЕ проверены без лицензированного аккаунта и разрешённого приложения Microsoft. На Local-запуске в этой среде Java дополнительно не имеет прямого DNS-доступа к Minecraft services; это не доказательство ошибки Microsoft identity.

## Ely.by

Сохранён документированный authenticate/validate/refresh/invalidate flow, двухфакторный retry, keyring и проверяемый официальный authlib-injector; avatar не влияет на успешность входа. Проверяется отсутствие secrets в metadata и поведение при недоступном OS keyring. Реальная проверка отклонённого логина не прошла: session proxy возвращает CONNECT 403 для authserver.ely.by. Нельзя считать Ely.by network/login проверенным в данной среде.

## Stop Game

Windows отправляет WM_CLOSE окнам собственного Java PID; Linux через XCB отправляет WM_DELETE_WINDOW только игровому окну с соответствующим PID и поддержкой WM_PROTOCOLS. Если подходящего окна нет, Canary предлагает ручное закрытие/Force, не посылая SIGTERM. Child mutex удерживается до запроса закрытия, чтобы monitor не позволил повторно использовать OS PID между проверкой и запросом. Ожидание фактического завершения до 8 секунд. Если игра не закрылась, пользователь видит Wait/Force/Cancel и предупреждение о несохранённом прогрессе. Force выполняется только отдельным подтверждённым действием. Повторный Stop после завершения безопасен; UI Stopping и backend atomic guard препятствуют повторной остановке. Console command `stop` и общий `taskkill java` не используются. Реальная Vanilla Java 21/Minecraft 1.21.1 запускалась и остановилась штатно; подтверждено сохранение playtime. На финальном проходе создан настоящий мир, затем повторно открыт; Stop через XCB завершил игру за 6,2 секунды на финальном исходном коде 5f91fd5. Лог содержит Saving players, Saving worlds и All dimensions are saved; level.dat/playerdata читаются как gzip NBT. Force не использовался.

## Modrinth

Сохранены поиск, pagination/filters, detail, versions, mrpack install и общий downloader. Реальная сетевая проверка прошла: Iris/Sodium dependencies, shaders, resourcepacks, datapacks, update, duplicate, enable/disable/remove, rollback и reload. Отдельно прошла реальная загрузка двух версий Modrinth modpack, обновление с сохранением user additions/config/world markers и rollback всех исходных hashes.

## CurseForge

Официальный API adapter, backend-only `CANARY_CURSEFORGE_API_KEY`, без ключа во frontend/Java children/JSON. Один Discover и Content UI с Modrinth: shared ProjectCard/detail/versions/review/progress/errors. Поддержаны mods/modpacks/resourcepacks/shaders/datapacks, game/loader filtering, стабильные версии, обязательные dependencies, optional review, конфликтующие зависимости, provenance, updates и pack repair/update/rollback. Server projects не выдаются как поддержанные. Проверен UI contract Discover → CF detail → ZIP version → install_curseforge_pack с сохранением provider и очисткой HTML. Отмена и смена поиска/проекта прерывают нативные CF-запросы; отдельный реестр read-only запросов не блокирует миграцию/закрытие launcher. Проверены освобождение request lease и игнорирование устаревших ответов; этот тест не считается сетевой установкой. Ограниченные файлы требуют официального manual download; CDN URL не угадывается.

Без настоящего API key сетевая установка CurseForge НЕ проверена. Реальные filesystem tests проверяют CF provenance, staged pack update/rollback, сохранение миров и блокировку cross-provider duplicate. Совместимость search metadata CF обозначается possible до проверки выбранного file; неполный latest-file список не выдаётся за достоверную несовместимость.

## Content Manager

Provider относится к item/project, updates остаются у исходного источника. Общая транзакция скачивает и проверяет файлы до apply; SHA-1 издателя CF дополнен локальным SHA-512 inventory. Существующие local files и mod IDs защищены от скрытой замены, datapack требует существующий world, shader требует enabled shader loader. Bulk preview/confirmation, import, search, sort, toggle/remove, update и rollback сохранены. HTML provider descriptions очищаются DOMPurify. Тестовые ZIP/JAR и world markers явно являются fixtures, а не реальными игровыми мирами.

## Build / Tests

Фактически выполнены `npm run build`, `cargo check --locked --manifest-path src-tauri/Cargo.toml --all-targets --features backend-check`, полный `cargo test --locked --manifest-path src-tauri/Cargo.toml` (50 passed, 5 отдельно обозначенных network tests ignored), `BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm test` (29 passed), `npm run tauri dev` через helper с GTK/WebKit, реальная подготовка/запуск/Stop/migration Minecraft, отдельно network tests real_content_install и real_pack_update_preserves_additions. Проверка реального Ely.by rejected login завершилась ошибкой network, причина подтверждена curl CONNECT 403. Сетевая проверка real_public_artwork_and_agent тоже остановилась на недоступном Ely.by profile endpoint.

Добавлен Desktop verification workflow: Windows/Linux check/test, release installers EXE/MSI/DEB, Windows native EXE startup/window smoke check, artifacts и git notes receipts. Первая Linux CI release-сборка успешна (93e7abe, run 37325198927). Windows cargo check прошёл; тесты выявили различие canonical Windows paths, исправленное нормализацией dunce. Финальный результат CI будет записан после выполнения. Локально выполнен `npm run tauri build -- --ci --bundles deb -- --locked`: получен release DEB около 22 MB. Финальные размеры и результат Windows CI будут записаны после выполнения. Windows-тест сравнивает путь нового экземпляра с каноническим выбранным каталогом: Windows canonicalization меняет представление временного пути, поэтому сравнение с ненормализованным temp_dir некорректно.

## Remaining blockers

Лицензированный Microsoft аккаунт и разрешение Minecraft services для public client; настоящий CurseForge API key; доступ session proxy к Ely.by; интерактивная Windows-проверка taskbar/Alt+Tab/DPI и Windows gameplay/Stop. Эти проверки не заменяются mocks и не объявляются выполненными.

## Изменённые и добавленные файлы

### Изменённые

- `.github/workflows/release.yml`
- `README.md`
- `docs/RELEASE.md`
- `package-lock.json`
- `package.json`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/capabilities/default.json`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/Square107x107Logo.png`
- `src-tauri/icons/Square142x142Logo.png`
- `src-tauri/icons/Square150x150Logo.png`
- `src-tauri/icons/Square284x284Logo.png`
- `src-tauri/icons/Square30x30Logo.png`
- `src-tauri/icons/Square310x310Logo.png`
- `src-tauri/icons/Square44x44Logo.png`
- `src-tauri/icons/Square71x71Logo.png`
- `src-tauri/icons/Square89x89Logo.png`
- `src-tauri/icons/StoreLogo.png`
- `src-tauri/icons/icon.icns`
- `src-tauri/icons/icon.ico`
- `src-tauri/icons/icon.png`
- `src-tauri/src/backend/accounts.rs`
- `src-tauri/src/backend/artwork.rs`
- `src-tauri/src/backend/commands.rs`
- `src-tauri/src/backend/content.rs`
- `src-tauri/src/backend/content_provider.rs`
- `src-tauri/src/backend/content_tests.rs`
- `src-tauri/src/backend/curseforge.rs`
- `src-tauri/src/backend/download.rs`
- `src-tauri/src/backend/elyby.rs`
- `src-tauri/src/backend/java.rs`
- `src-tauri/src/backend/loaders.rs`
- `src-tauri/src/backend/minecraft.rs`
- `src-tauri/src/backend/mod.rs`
- `src-tauri/src/backend/model.rs`
- `src-tauri/src/backend/modpacks.rs`
- `src-tauri/src/backend/pack_update.rs`
- `src-tauri/src/backend/process.rs`
- `src-tauri/src/backend/storage.rs`
- `src-tauri/src/backend/system.rs`
- `src-tauri/src/backend_check.rs`
- `src-tauri/src/installer.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src/App.tsx`
- `src/components/ContentManager.tsx`
- `src/components/CursorPack.css`
- `src/components/Markdown.tsx`
- `src/components/RuntimeUI.css`
- `src/components/RuntimeUI.tsx`
- `src/components/TitleBar.tsx`
- `src/components/VisualAppearance.css`
- `src/components/VisualAppearance.tsx`
- `src/hooks/useDiscovery.ts`
- `src/main.tsx`
- `src/services/backend.tsx`
- `src/services/discovery.ts`
- `src/services/modrinth.ts`
- `tests/appearance.spec.ts`
- `tests/backend-ui.spec.ts`
- `tests/polish.spec.ts`

### Добавленные

- `.github/workflows/verify.yml`
- `docs/FINAL_INTEGRATION_QA.md`
- `public/cursors/compact/alternate.cur`
- `public/cursors/compact/beam.cur`
- `public/cursors/compact/busy-static.cur`
- `public/cursors/compact/dgn1.cur`
- `public/cursors/compact/dgn2.cur`
- `public/cursors/compact/handwriting.cur`
- `public/cursors/compact/help.cur`
- `public/cursors/compact/horz.cur`
- `public/cursors/compact/link.cur`
- `public/cursors/compact/move.cur`
- `public/cursors/compact/person.cur`
- `public/cursors/compact/pin.cur`
- `public/cursors/compact/pointer.cur`
- `public/cursors/compact/precision.cur`
- `public/cursors/compact/unavailable.cur`
- `public/cursors/compact/vert.cur`
- `public/cursors/compact/working-static.cur`
- `scripts/prepare-desktop-assets.py`
- `src-tauri/icons/64x64.png`
- `src-tauri/src/backend/client_window.rs`
- `src-tauri/src/backend/curseforge_content.rs`
- `src-tauri/src/backend/microsoft.rs`
- `src-tauri/src/backend/storage_settings.rs`
- `src-tauri/src/backend/wallpapers.rs`
- `src/components/MicrosoftLogin.tsx`
- `src/components/ProjectCard.tsx`
- `src/components/StorageSettings.tsx`
- `src/components/WindowFullscreen.ts`
- `src/services/backgrounds.ts`
- `src/services/providers.ts`
