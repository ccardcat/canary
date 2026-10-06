# Canary Discord Rich Presence — implementation and QA

## Discord Architecture

Работа началась с `git pull --ff-only` и чистого `git status`: исходный `main`
`9a061a94170151295332de1d267b7eebbc2e2ff5`. Изучены Rust/Tauri, маршруты,
существующие `activity::Registry`/`Job`, процессы Minecraft, Settings и RU/EN.
Новый Activity Dock и отдельный реестр установок/игровых процессов не добавлены.

Используется `discord-rich-presence = 1.1.0` — актуальный стабильный выпуск
от 26 января 2026 года по индексу crates.io. Проверены исходники и SHA256
архива, совпадающий с registry checksum. Crate предоставляет типизированную
модель Discord Activity. Его стандартный синхронный клиент имеет неограниченное
ожидание handshake и не подтверждает `SET_ACTIVITY`; поэтому транспорт
реализован на уже используемом Tokio: Windows named pipes и Unix sockets,
полное чтение фрагментированных кадров, READY, nonce/ACK, ERROR, ping/pong,
ограничение входного кадра 64 KiB и I/O timeout 2 секунды. Вся попытка
подключения ограничена тремя секундами.

Для обычного desktop Presence достаточно локального RPC. Social SDK не нужен
для account linking, multiplayer или другого SDK-сценария в этой задаче.
Embedded App SDK, Discord bot, Gateway, webhook, OAuth и отдельный сервер
в приложении не используются. Тестовый сервер протокола существует только в QA.

`backend::discord::Manager` владеет соединением, mapping, deduplication,
throttling, clear и reconnect. Он читает существующий реестр задач и
`Backend::processes`. Данные игровой сессии находятся непосредственно в
`Running`, заполняются после реального `Command::spawn` и удаляются вместе с
процессом. При нескольких играх выбирается самая поздняя сессия; одинаковые
timestamps разрешаются по стабильному instance ID. Никаких UI-флагов Playing.

Один React bridge сообщает только semantic view, язык и privacy preferences.
Открытый проект Content Manager передаётся через общий semantic overlay;
components не собирают Discord JSON и не отправляют игровые состояния.
Tauri interface: одна команда `discord_presence_context`, событие
`discord-presence-status`. Frontend сериализует/coalesces запросы настроек.

Приоритет: Playing → Launching → активные Download/Install/Update/Repair →
Project → текущая страница → Idle. Cancelling/Cancelled/Failed/Completed больше
не участвуют в выборе. Навигация ограничена одним обновлением в секунду,
progress — одним в пять секунд. Идентичный payload не отправляется повторно.
Начало/выход игры и окончание задачи не задерживаются этим throttle.

Reconnect: 2 → 4 → 8 → 16 → 30 секунд, далее максимум 30; после соединения
сброс. Heartbeat каждые 15 секунд обнаруживает закрытие Discord даже при
неизменившемся Presence. Нет busy loop и повторных toast/dialog.
Off немедленно запускает `SET_ACTIVITY: null` и закрывает соединение. Если
Discord завис во время I/O, смена privacy прерывает ожидание и закрывает pipe:
отключение клиента очищает Presence и не позволяет воспроизвести старые данные.
Exit просит manager завершиться; закрытие процесса также закрывает pipe.
Сбой Discord не останавливает Minecraft или Canary.

Application ID хранится **строкой** в одной конфигурации
[`src-tauri/discord-presence.json`](../src-tauri/discord-presence.json):
`1557109738037055498`. Optional `CANARY_DISCORD_CLIENT_ID` работает только в
debug-сборке. Public Key не добавлен в код или конфигурацию; никакие Discord
пароли, bot/user tokens или client secrets не нужны.

## Presence States

Текущий copy polish убирает provider/category из details/state и лишние
служебные подписи навигации. Progress, privacy, timestamps, assets и RPC
архитектура сохранены; см. [theme/copy audit](THEME_CONTRAST_QA.md).
Исторические native/protocol отчёты ниже относятся к состоянию до copy polish.

| Состояние | RU details | Secondary state |
| --- | --- | --- |
| Home | На главной | — |
| Discover | Просматривает проекты | — |
| Project | Смотрит Better MC / Смотрит проект | — |
| Library | Управляет экземплярами | — |
| Settings | Настраивает Canary | — |
| Downloading | Загружает Better MC | 67% · 43 / 97 файлов |
| Installing | Устанавливает Better MC | Процент и файлы; без количества файлов — только процент |
| Updating | Обновляет Better MC | Процент и файлы |
| Repairing | Восстанавливает экземпляр/имя | Процент и файлы |
| Launching | Запускает Minecraft | Имя, если разрешено |
| Playing | Играет через Canary | Имя · Minecraft version |
| Private Playing | Играет в Minecraft | Minecraft version |
| Idle/Error | В Canary | Без технического текста ошибки |

English equivalents и кнопки выбираются по текущему языку Canary. Запуск
Minecraft имеет отдельное состояние до spawn. Таймер Playing создаётся один
раз на сессию; progress, навигация, язык и privacy не меняют его. После exit
выбирается текущая страница или другая реальная активность. Новая игра получает
новый timestamp. Строки ограничены 128 UTF-8 байтами без разрыва символов;
удаляются только управляющие символы. Percent округляется, filenames/paths и
тексты ошибок не попадают в payload.

## Privacy

Отдельная секция **Settings → Discord**, доступная через поиск. Все пять
настроек по умолчанию On: Rich Presence, instance name, project names,
install/download activity, current page. Короткие описания RU/EN и нейтральные
Connected / Discord not running or unavailable / Disabled. Web preview честно
сообщает, что соединение доступно в desktop app.

Настройки используют существующий `canary-visual` persistence и type-safe
normalization. Старые config получают sane defaults, Off сохраняется при
перезапуске. Manager не подключается до чтения сохранённых preferences в
renderer: сохранённый Off не вызывает временную публикацию при старте.
Account username/email/Microsoft IDs/Ely.by session никогда не входят в model.
Instance name Off скрывает имя в Playing/Launching; project names Off скрывает
имя открытого/устанавливаемого проекта. Downloads Off исключает операцию из
Presence; текущий раздел и реальная игра продолжают работать. При нескольких
privacy ограничениях используется более строгий вариант.

## Discord Assets

В Developer Portal приложения Canary следует загрузить существующий Canary
branding, например `public/branding/canary-bird-white.png`, как **canary_logo**.
Список возможных keys:

| Key | Использование |
| --- | --- |
| canary_logo | Large image, hover: Canary — Minecraft Launcher |
| minecraft | Small image: Vanilla Minecraft |
| fabric | Fabric, с loader version если известна |
| forge | Forge |
| neoforge | NeoForge |
| quilt | Quilt |
| modrinth | Modrinth project/instance |
| curseforge | CurseForge project/instance |

Все keys централизованы в `discord-presence.json`. После загрузки и проверки
добавьте только реально существующие keys в `confirmedAssets`. Сейчас список
пуст: доступ к Developer Portal и наличие assets не подтверждены. Неизвестные
keys не отправляются; используются стандартное отображение/иконка приложения
Discord и отсутствие small image. Можно подтвердить только `canary_logo` —
остальное останется optional. Новое branding не генерируется, private image
URLs не используются.

## Buttons

Реализована одна локализованная кнопка **Сайт Canary / Canary website**:
`https://plash3r.github.io/canarylauncher-site/` — адрес предоставлен владельцем.
Правильный URL подтверждён в реальном IPC payload Canary и unit test. Проверка
HTTP-страницы и клик непосредственно в Discord пока не выполнены: cloud proxy
отклоняет этот домен с 403. Для проверки сайта в облаке нужен hostname
`plash3r.github.io` в разрешённых доменах среды.

Download остаётся `null`: отдельная публичная рабочая ссылка не подтверждена.
Поддерживаются до двух HTTPS-кнопок из этой конфигурации. Private GitHub,
локальные IP/localhost, credentials в URL и неправильные протоколы отклоняются.

## QA

Выполнено:

- **72 Rust tests passed, 6 existing network tests ignored.** Девять новых
  Discord tests: Home/RU/EN/страницы, project privacy, Playing priority/session
  timer, concurrent sessions, install progress/privacy/terminal cleanup,
  длинные Unicode-имена/assets/buttons, disabled/defaults, dedup/throttle,
  фрагментированный handshake/ping/ACK/clear/disconnect, rejected/oversized
  response и timeout. Unix socket integration проверяет reconnect, Off/On,
  настоящий spawned OS child, game exit и shutdown.
- **5 Discord Playwright tests passed:** persistence/Off/On/privacy, semantic
  navigation, project open/close, RU/EN, Light/Dark/AMOLED и Monocraft без
  горизонтального overflow. Это frontend contract tests с mocked Tauri.
- **27 существующих Activity/backend UI tests passed**: cancellation/failure,
  downloads, account/provider/content flows, Play/Stop, F11, MRPACK creation,
  storage и keyboard dropdowns. Удалённый Activity Dock не появился.
- **`npm run tauri dev` действительно запущен** в GTK/WebKit/Xvfb. Canary
  работал без Discord, без fatal error/toast. Затем локальный Unix RPC test
  server запущен после Canary: Presence появился без перезапуска. Реальный
  Settings toggle Off отправил null, On восстановил подключение.
- Через настоящий Tauri command запущен подготовленный **Minecraft 1.21.1,
  Java 21**, Local QA profile: реальный игровой процесс и main menu;
  Playing/timestamp в IPC, навигация не меняет timer, privacy скрывает имя,
  graceful Stop возвращает Home. Это не лицензионная online-auth проверка.

Native evidence: [`docs/qa/discord/native-report.json`](qa/discord/native-report.json),
[`settings.png`](qa/discord/settings.png),
[`minecraft.png`](qa/discord/minecraft.png).

Не выполнено: визуальный профиль в **настоящем авторизованном Discord desktop**,
закрытие/открытие именно Discord client, Developer Portal assets и клик кнопки
в Discord. Тестовый protocol peer и реальные Canary/Minecraft не выдаются за
эти проверки. Windows native QA evidence и ограничения приведены ниже.

## Build Report

`npm run build` и `cargo check --locked --manifest-path src-tauri/Cargo.toml`
прошли. `npm run tauri dev -- --no-watch` выполнен с cloud runtime helper и
поддерживаемым override `beforeDevCommand` для уже запущенного Vite.
Релизный кандидат **0.1.5**, source `b2f4d95d9a09334e852e4758ff88bdce55337d32`, локально
собран в DEB и AppImage. SHA256 cloud artifacts:

| Artifact | SHA256 |
| --- | --- |
| Canary_0.1.5_amd64.deb | `9a6278b88ba9737728ebb0efdeda6bed384171b93f24263ce69e6cde4c37ee2b` |
| Canary_0.1.5_amd64.AppImage | `741c9582c90ff94ca26aa430ab61038c4662c0c958e90687c73245b9facd7616` |

Оба **упакованных 0.1.5** запущены в GTK/WebKit, с отдельными QA profiles:
Home, `tauri://localhost`, Low (`sidebar/settings backdrop-filter:none`),
пять Discord switches, сохраняемый Off и отсутствие alert прошли
([DEB report](qa/discord/packaged-015-report.json),
[AppImage report](qa/discord/appimage-015-report.json)). AppImage запущен
без PRoot; после перезапуска восстановлены Off и Low, статус Disabled, alert — 0.
Это cloud Debian/sysroot artifacts; они отличаются от официальной
Ubuntu-22.04 сборки в Releases. Совместимость со всеми distributions не заявляется.

История проверки предыдущего **0.1.4** кандидата: Linux DEB собран; SHA256:
`6687241acfef7eec711cf7b3daf171831a2d3b45ef658c11f2edcae1173465c3`.
Упакованный DEB извлечён и запущен с отдельным чистым QA profile:
`tauri://localhost`, Home отрисован, нет alert, пять Discord switches и
сохраняемый Off проверены; повторный старт DEB сохраняет Off и не выдаёт alert
([packaged report](qa/discord/packaged-report.json)).
AppImage также собран (120.47 MiB); SHA256:
`b6bf59304db7232f7e8855dc1db3c13d3c838c110792089548539461d5b577d0`.
Cloud sysroot требует явного включения WebKit helpers через локальный AppImage
config override; итоговый AppImage запущен без PRoot с sysroot OpenGL libraries,
в Xvfb, с новым profile и без Discord. Home, отсутствие alert, пять switches
и Off persistence проверены ([AppImage report](qa/discord/appimage-report.json)).
Это не проверка совместимости со всеми Linux distributions. Официальная
Ubuntu-22.04 сборка и Windows EXE/MSI через Actions отслеживаются отдельно.

Windows Actions [37522078057](https://github.com/ccardcat/canary/actions/runs/37522078057):
TypeScript build, Cargo check, **69 Rust tests passed / 6 ignored**, NSIS EXE
(19.76 MiB) и MSI (21.11 MiB) успешно собраны. Linux job также успешен.
Native Windows QA не прошёл: CDP port `9384` недоступен. Безопасные startup
stages подтверждают завершённый Tauri setup; реальное окно Canary отзывчиво,
WebView2 processes работают ([startup report](qa/discord/windows-startup-report.json)).
Это ошибка подключения инспектора, а не свидетельство падения приложения.

Для следующего run добавлен отдельный **native-qa** feature (`tauri/devtools`)
и explicit loopback inspector configuration. Обычные EXE/MSI создаются до него,
без feature; затем same-source release executable с инспектором используется
для автоматизации UI. Это не проверка установки обычного MSI/EXE. Сборка с
инспектором не попадает в release assets. Build artifacts сохраняются даже
при провале native QA, но failed QA продолжает блокировать публикацию релиза.
Результат native test 0.1.5 подтверждён ниже. Дополнительно устранена
гонка в `choose()` оконного smoke-теста: он ждёт renderer control после animated
Settings tab transition. В настоящем GTK/WebKit подтверждено, что немедленно
после перехода control отсутствует; ожидание, Traffic Lights, Left controls,
Text branding и восстановление исходных preferences проходят без alert
([dropdown report](qa/discord/dropdown-wait-report.json)).


После включения инспектора Windows run `37524574258` проверил реальное окно:
F11/Escape, normal/maximized restore, 15 сочетаний темы и native material,
fullscreen fallback/restoration, opacity/blur/tint, sidebar side, titlebar и
keyboard dropdowns. **36 captures выполнены методом native-desktop**. High
quality sample: 258 frames / 4007.5 ms, median 15.6 ms, p95 15.7 ms, 0 frames
>50 ms. Это измерения hosted runner, не обещание FPS на пользовательском GPU.
[Native material report](qa/discord/windows-material-report.json) содержит
частичный успех и итоговый failure на Low: sidebar blur оказался `4px`.

Для **0.1.5** исправлены stale Low-quality override и порядок prefixed/standard
backdrop declarations: при production CSS minification прежний порядок оставлял
только WebKit property, которую Chromium игнорировал. Standard declaration
теперь идёт после vendor fallback. В **production Vite assets**, headless Chromium,
для Light/Dark/AMOLED sidebar/settings/nav-capsule проверены `backdrop-filter:none`
([production report](qa/discord/production-low-report.json)). Existing low-quality
appearance regression и 10 material/appearance tests также прошли. В publication download добавлен installer-only artifact pattern;
QA executable с инспектором исключён из release asset inputs.

**Windows 0.1.5 native pass** подтверждён GitHub Actions
[37528927493](https://github.com/ccardcat/canary/actions/runs/37528927493):
**34 cases**, **37 native-desktop captures**, все пять материалов и три темы,
fullscreen/restore, dropdowns, titlebar и preference controls. High и Low:
258 frames за ~4 секунды, median 15.6 ms, p95 15.7 ms, 0 frames >50 ms;
Low sidebar blur — `none`. Particles — 0 из-за reduced-motion на runner.
Это same-source release executable с QA inspector feature; установка production
MSI/EXE и FPS на пользовательском GPU этим не подтверждаются.
Linux verification в том же run также **success**.
[Полный Windows report](qa/discord/windows-015-report.json),
[Light Acrylic](qa/discord/light-acrylic-windows-015.png),
[Dark Acrylic](qa/discord/dark-acrylic-windows-015.png),
[Dark Mica fullscreen](qa/discord/dark-mica-fullscreen-windows-015.png).

**0.1.5 опубликован**:
[GitHub Release](https://github.com/ccardcat/canary/releases/tag/v0.1.5).
Release workflow [37528929656](https://github.com/ccardcat/canary/actions/runs/37528929656)
завершён успешно: оба build jobs, record-start и publish — success.
Проверен receipt и независимый diagnostics: release не draft и не prerelease,
ровно четыре production installers и SHA256SUMS, все файлы непустые,
инспектор EXE отсутствует. Tagged source — `b2f4d95d9a09334e852e4758ff88bdce55337d32`.
[Publication evidence](qa/discord/release-015-report.json).

| Official release installer | SHA256 |
| --- | --- |
| Canary_0.1.5_x64-setup.exe | `7ab0ea25c7dc84271155e475fc8f40ff5db76d917f15570e4833671c35fb01be` |
| Canary_0.1.5_x64_en-US.msi | `d570e3216512627483f64ca6d1213182d61060fee594d8f1dc257caa65ee5c95` |
| Canary_0.1.5_amd64.deb | `ebcf9dfaf475a3968657e32528e827a4fe265582f7e853cfb49d6fc7c015ef83` |
| Canary_0.1.5_amd64.AppImage | `652241ecd73c9e62488a0225a0f2d5833da036b8af0c212aeba7cae63bc75988` |

`main` дополнительно включает theme/copy polish
`6f372362f1366e86ea9ce4d8c82ae3d0fd05f2b7`, синхронизированный fast-forward.
Для этого source повторно прошли `npm run build`, `cargo check --locked`,
**73 Rust tests / 0 failed / 6 ignored** и **11 Discord/theme Playwright tests**.
Настоящий `npm run tauri dev -- --no-watch` пересобран и запущен в GTK/WebKit;
Home визуально проверен ([current main screenshot](qa/discord/current-main-native.png)).
Эти изменения находятся после release tag; результаты Windows и packaged
0.1.5 выше относятся к tagged source, а не к theme/copy polish.
Для нового `main` Actions [37531432654](https://github.com/ccardcat/canary/actions/runs/37531432654)
проверяет обе desktop platforms отдельно: Linux — success; Windows ещё выполняется
на момент записи отчёта.

## Git Report

Branch: `main`. Starting commit:
`9a061a94170151295332de1d267b7eebbc2e2ff5`. Перед commit проверены diff и отсутствие
generated/secret files; перед push main актуализирован, incoming `6f37236` сохранён.
Implementation commits `bc67511`, `e8a352e`, `9b01e3d`, `b2f4d95` отправлены в main.
Итоговый documentation commit hash и push status приводятся в сообщении о выполнении.
Существующие release tags не двигаются; tag `v0.1.5` остаётся на `b2f4d95`.

## Remaining Issues

Нужен реальный Discord desktop для визуального подтверждения,
подтверждение/загрузка assets в Developer Portal и проверка публичного сайта.
Отсутствующие Discord credentials не являются требованием к запуску или сборке.
HTTP site verification в облаке ограничен network policy. Download button
пока скрыта. Windows native QA и публикация tagged 0.1.5 подтверждены выше.
Windows/Linux CI для последующего theme/copy polish — отдельный run, его результат
не подменяется результатами релиза. Установка production MSI/EXE, пользовательские
DPI/GPU и лицензионный online Minecraft gameplay не заявляются проверенными здесь.
