# Canary 0.1.3 — отчёт по дополнительному ТЗ

Основа: `main`, `e6d5565`, после `git pull --ff-only`. Реализация внесена в существующий React/Tauri/Rust launcher. Основные изменения: `7309c70`, `df1a450`, `53fc497`, `a894006`, `6a72538`, `cffdd66`. Версия package/Tauri/Cargo согласована: **0.1.3**. Проверки предыдущей 0.1.2 не считаются проверками новой версии.

## F11

Настоящий нативный fullscreen через Tauri: normal/maximized/fullscreen, сохранение physical size/position, восстановление maximized, блокировка повторных событий до подтверждения перехода. Escape сначала закрывает диалог/меню. Состояние fullscreen не сохраняется между запусками. Sidebar и фон занимают всю высоту без полосы titlebar.

Проверка свежего packaged startup обнаружила отсутствующий начальный `windowTransition`: он теперь явно `false` до первого F11, что устраняет зависимость Windows smoke test от предыдущих переходов или dev hot reload. Проверены normal и unlocked state до первого события.

В реальном Linux-сеансе с Openbox проверены и Tauri API, и X11 `_NET_WM_STATE`:

| Переход | Фактическое окно |
| --- | --- |
| Normal | 1080×680, x=70, y=40 |
| F11 | 1280×800, x=0, y=0; `_NET_WM_STATE_FULLSCREEN` |
| Повторный F11 | 1080×680, x=70, y=40 |
| Maximized → fullscreen → exit | оба `_NET_WM_STATE_MAXIMIZED_*` восстановлены |
| Шесть быстрых F11 | один переход, затем обычный Escape возвращает окно |
| Settings в fullscreen | первый Escape закрывает Settings; второй выходит из fullscreen |

Windows CI запускает именно собранный EXE и проверяет эти переходы через его настоящий WebView2 и нативный window API. Выполнение Windows-проверки должно подтверждаться результатом Actions; Linux не заменяет Windows QA.

## Liquid Glass

Общий материал: слоистая заливка, мягкие границы и отражения, согласованные радиусы и тени, blur поверхностей. Подключён к карточкам, sidebar, titlebar, диалогам, dropdowns и tooltip. Есть сила стекла, presets и frost. У модальных окон минимум 95% заливки, у dropdowns 97%.

При нативном просмотре исправлено перемножение alpha светлой палитры и материала: светлое окно Settings больше не просвечивает сильнее выбранной настройки. В Low quality UI backdrop blur и дорогой frost отключены; поверхности плотнее, частицы ограничены шестью. Это объяснено рядом с выбором quality. Проверка фактической alpha и отключения blur добавлена в UI-тесты.

Нативные Linux-скриншоты текущего UI:

- [Light Settings](qa/0.1.3/light-settings.png)
- [Dark Settings](qa/0.1.3/dark-settings.png)
- [Fullscreen Settings](qa/0.1.3/fullscreen-settings.png)

## Vibrancy

Настоящий Windows HWND backdrop через `window-vibrancy`, без захвата wallpaper. `RtlGetVersion` определяет действительный Windows build; unsupported варианты отключены. Поддерживаются Solid, Transparent, Acrylic, Mica, Mica Alt. При ошибке выбирается ближайший поддерживаемый вариант, и UI показывает фактически применённый материал. В fullscreen Mica/Mica Alt временно переключаются на Acrylic/Transparent/Solid; на выходе снова применяется выбранный материал.

Корневые html/body/#root прозрачны только при Desktop Vibrancy и реально активном нативном материале; Canary artwork скрывается. Прозрачность и tint меняют нативный Acrylic tint и UI veil; настройка поверхности независима. Нативный радиус blur Windows не выдаётся за регулируемый: slider подписан **UI surface blur**. Прозрачность окна и tint отключены при Solid fallback.

На Linux используется честный Solid fallback. Общая `transparent: true` давала белый GTK/WebKit viewport: исправлено `transparent: false` для Linux и отдельной `tauri.windows.conf.json` с `transparent: true` для Windows. Реальное применение Mica/Acrylic и их desktop-композицию в этой Linux-среде проверить нельзя.

## Titlebar

Центрирование брендинга относительно всего окна; Icon, Text, Icon + Text, Hidden. Windows, Minimal, Compact, Traffic Lights; controls слева/справа. Drag layer расположен под управляющими кнопками; двойной щелчок меняет maximized. В fullscreen titlebar скрыт. Выбор сохраняется; keyboard и видимость проверены UI-тестами. Интерактивный Windows DPI/Alt+Tab/taskbar остаётся отдельной платформенной проверкой.

## Effects

Snow, Sakura, Autumn Leaves; размеры, скорость, плотность, opacity, wind, варианты листьев и траектории. Presets Off/Low/Medium/High/Custom. Частицы не перехватывают ввод и расположены позади контента. Low/Balanced/High quality ограничивает число частиц 6/16/24, поэтому High effect при Balanced quality действительно даёт 16, а не обещает 24. Reduced motion и focus mode прекращают движение. Настройки сохраняются и нормализуются при повреждённых preferences.

## Dropdowns

Все JSX selects заменены GlassSelect: themed trigger, top-layer popup, выбранный/disabled/focus/hover состояния, высота с прокруткой, размещение выше/ниже в пределах viewport. Arrow/Home/End, Enter/Space, typeahead, Escape. Нативный backing select сохраняет controlled/form поведение, но не отображается пользователю. Popup работает и внутри нативного modal dialog; Escape закрывает dropdown, сохраняя Settings. Проверены клавиатура, границы и фактическая плотность заливки.

## Hero

Только application backgrounds из общего registry, включая импортированные App/Both; Sidebar-only исключён. Случайный старт, отсутствие немедленного повтора, preload следующего изображения, crossfade 880 ms, ручные стрелки/точки. По умолчанию 9 секунд, настройка 7–20. Hover/focus/скрытое окно/reduced motion/focus mode приостанавливают автоматическую смену; ручной выбор остаётся доступен. Удаление активного custom artwork корректирует индекс без мгновенного повтора fallback.

## Create Instance

Нативный `.mrpack` picker → preview → импорт и подготовка. Проверяются формат/index/game/dependencies, Minecraft/loader, пути, лимиты архива, SHA/размер загруженных файлов. SHA-256 выбранного архива защищает preview/import от подмены. Client/common overrides, provenance, metadata, managed content receipts, повторное открытие и local pack repair поддержаны.

Импорт выполняется в новой staging-папке с atomic commit. Traversal, symlinks, дубли путей, Windows reserved names, запись в worlds/служебные пути и конфликт overrides с проверенными mods/libs отклоняются. Ошибка/отмена очищает незавершённый stage, не затрагивая существующие экземпляры. Lease защищает создание от повторных запросов; один request UUID связывает UI progress/cancel с backend. Успешное создание обновляет Library, закрывает диалог и подсвечивает карточку.

В реальном Tauri UI Linux через GTK picker импортирован локальный `.mrpack`, override сохранён, Minecraft/Java подготовлены, статус **Ready**, диалог автоматически закрыт, карточка сразу появилась. Отдельный **реальный сетевой** тест импортировал официальный Fabric pack (MC 1.21.1), проверил 50 downloads, hashes, overrides, metadata и повторную загрузку backend. Unit-тесты проверили некорректный index, опасные пути, совместимость и cleanup при ошибке checksum.

## Microsoft

Сохранён public client `e96175e4-2fd4-43ec-8911-8335f7783ebd`, browser PKCE/loopback/state validation, refresh token в OS keyring, Xbox → XSTS → Minecraft Services → ownership → profile. В launch используется настоящая msa identity, не Local. Ely.by flow не подменён.

Убрана общая ошибка `Microsoft/Xbox rejected the session`. Отдельные stage/error и progress показывают OAuth registration/grant, Xbox profile, XSTS family/region, Minecraft Services application/session, entitlement service и missing Java profile; network остаётся network при восстановлении. Ответ ошибки не выдаёт токены и не принимает сбой entitlement endpoint за доказательство отсутствия лицензии.

**Точная причина отказа конкретного лицензированного аккаунта не установлена без его login attempt.** Отказ 403 на Minecraft Services может требовать разрешения приложения у провайдера; изменение текста ошибки это разрешение не предоставляет. В cloud runtime нет лицензированного аккаунта и рабочего Secret Service. Реальный полный login/refresh/online gameplay остаётся непроверенным; stage/state/PKCE/error regression tests выполнены.

## CurseForge

В текущей среде `CANARY_CURSEFORGE_API_KEY` отсутствует — это установленная причина недоступности live CF здесь. Используется только официальный API, без зеркал/скрытых ключей. Missing key, invalid format, 401, 403, 429, 5xx имеют отдельные понятные ошибки. Private header не логируется. Ошибка CF update-check одного экземпляра не обрывает Modrinth checks.

Сохранены provider selector, поиск, фильтры, sort, details/files, подтверждение dependencies, install/update и packs с официальными ограничениями download. UI pagination проверена 1→2→3→2→1 с offsets 0/12/24/12/0. Эти тесты используют контролируемые API ответы: **live CurseForge search/install/update не объявлены выполненными без настоящего API key**.

## Tests

Выполненные команды и реальные результаты этого прохода:

| Проверка | Результат |
| --- | --- |
| `npm run build` | Успешно; TypeScript + Vite production |
| `cargo check --locked --manifest-path src-tauri/Cargo.toml` | Успешно, Linux |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 57 passed, 6 ignored, 0 failed |
| Playwright, финальная полная серия для `a894006` | 40 passed, 0 failed |
| Дополнительная серия light/quality/theme/persistence | 3 passed, 0 failed |
| Проверки после отключения Low UI blur (`6a72538`) | 3 passed, 0 failed; повторный production frontend build успешен |
| Startup/F11/material tests (`cffdd66`) | 3 passed, 0 failed; production frontend build успешен |
| `real_content_install --ignored` | 1 passed; реальные Modrinth mods/deps/shader/resourcepack/datapack/update/rollback |
| `real_pack_update_preserves_additions --ignored` | 1 passed; два настоящих pack versions, сохранены пользовательские addon/config/world marker |
| `real_local_archive_import --ignored` | 1 passed; настоящий официальный mrpack, download/hash/overrides/metadata/persistence |
| `tauri dev`, нативный Linux + Openbox | Геометрия, maximized, rapid F11, Escape, 3 themes и честный Solid fallback подтверждены |
| Готовый DEB, извлечённый исполняемый файл `cffdd66` | Открыт без Vite на `tauri://localhost`, fresh startup normal; повторная полная нативная window/theme/fallback серия успешна |
| Нативный Create Instance | Системный picker, preview, подготовка, Ready, auto-close и Library подтверждены |
| Реальный Minecraft 1.21.1 / Java 21, текущая 0.1.3 | Local QA profile → существующий QA world → Stop без force: 6773 ms; сохранены игрок, chunks и все dimensions |
| Windows CI smoke script | Добавлен в verification/release; локально проверен синтаксис, Windows результат ожидается |

JSON-отчёт нативной геометрии: [native-window.json](qa/0.1.3/native-window.json). Скрипт Windows smoke не подменяет IPC: запускает EXE и использует CDP его настоящего WebView2. Native desktop screenshots и JSON загружаются artifacts; если hosted desktop недоступен, screenshot помечается `webview-only`, а не объявляется доказательством desktop blur.

В Windows smoke добавлено измерение настоящих rAF intervals High/Low при native material + glass + autumn + Hero + fullscreen; Low проверяет фактические `backdrop-filter: none` и максимум 6 частиц. Это подготовленная CI-проверка, а не уже выполненный Windows benchmark. Timings сохраняются в JSON и не подменяются придуманным FPS.

Сохранение мира подтверждено логом `All dimensions are saved`, изменением SHA-256/mtime `level.dat`, успешной GZIP/NBT проверкой и актуальным `LastPlayed`: [minecraft-stop.json](qa/0.1.3/minecraft-stop.json). Это Local single-player проверка из Unicode-пути с пробелами; licensed online session ей не подменяется. Сообщения Mojang services о сети/public key в таком профиле не объявляются успешным Microsoft login.

Локально собран release DEB для `cffdd66`: `Canary_0.1.3_amd64.deb`, **22 712 314 bytes**, SHA-256 **e5870699cde2ac73966e9d49d4e3a4eae1f8c5fa9a1499ae8e23fbf71f13e00d**. Это локальный Linux build, не подтверждение опубликованных GitHub assets. Старые промежуточные DEB/checksums этой версии не считаются финальными.

## Remaining issues

- Полный Microsoft licensed login/refresh/gameplay требует настоящего аккаунта, доступного OS keyring и permission public client в Minecraft Services.
- Live CurseForge требует официального API key, переданного безопасно в окружение launcher; текущие controlled-response tests не заменяют такую проверку.
- Реальная Windows visual/material/DPI/gameplay QA и публикация installers требуют успешного hosted Windows runner. Actions по ответу пользователя выполняется; окончательные результаты ещё не подтверждены.
- В Linux Xvfb/WebKit software rendering тяжёлый режим High с 24 частицами дал median rAF interval 234 ms и p95 304 ms на 180 кадрах. Старый Low с blur 4 px дал 101/137 ms на 60 кадрах; Low без blur — 152/222 ms во время очередной release compilation. Отключение blur подтверждено, но улучшение FPS этим экспериментом не доказано: нагрузка CPU менялась. Это реальная медленная headless конфигурация; отсутствие серьёзных задержек и Windows GPU FPS пока не подтверждены. Данные: [software-rendering.json](qa/0.1.3/software-rendering.json).
- Старый `v0.1.2` не перемещается. Новый `v0.1.3` должен публиковаться отдельным release workflow с EXE/MSI/DEB/AppImage и checksums; наличие source tag не равно опубликованному Release.

Сетевые/аккаунтные требования не маскируются fake success или offline identity.
