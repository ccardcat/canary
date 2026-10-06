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

| Состояние | RU details | Secondary state |
| --- | --- | --- |
| Home | На главной | Canary |
| Discover | Ищет новые проекты | Provider · категория |
| Project | Смотрит Better MC / Смотрит проект | Сборка/Мод/… · Provider |
| Library | Управляет экземплярами | Library |
| Settings | Настраивает Canary | Settings |
| Downloading | Загружает Better MC | 67% · 43 / 97 файлов |
| Installing | Устанавливает Better MC | Процент и файлы либо Minecraft/loader |
| Updating | Обновляет Better MC | Процент и файлы |
| Repairing | Восстанавливает экземпляр/имя | Процент и файлы |
| Launching | Запускает Minecraft | Имя · Minecraft version |
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
эти проверки. Финальная Windows executable/native QA зависит от Actions.

## Build Report

`npm run build` и `cargo check --locked --manifest-path src-tauri/Cargo.toml`
прошли. `npm run tauri dev -- --no-watch` выполнен с cloud runtime helper и
поддерживаемым override `beforeDevCommand` для уже запущенного Vite.
Linux DEB собран; SHA256:
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
Результат нового native test ещё требует подтверждения.

## Git Report

Branch: `main`. Starting commit:
`9a061a94170151295332de1d267b7eebbc2e2ff5`. Перед commit проверены diff и отсутствие
generated/secret files; перед push актуализируется main. Итоговый hash и push
status приводятся в сообщении о выполнении. Существующие release tags не двигаются.

## Remaining Issues

Нужны native Windows + реальный Discord desktop для визуального подтверждения,
подтверждение/загрузка assets в Developer Portal и проверка публичного сайта.
Отсутствующие Discord credentials не являются требованием к запуску или сборке.
HTTP site verification в облаке ограничен network policy. Download button
пока скрыта. Windows CDP smoke/release publication должны иметь подтверждённый
результат, прежде чем считать релиз опубликованным.
