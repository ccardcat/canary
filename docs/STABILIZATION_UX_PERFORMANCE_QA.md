# Canary stabilization and UX pass — 2026-10-07

## Account Conflict Handling

Причина блокировки удаления: общий jobs.is_empty() в remove_account запрещал действие с любым аккаунтом при любой операции. Теперь удаление резервирует конкретный account ID. Запуск атомарно выбирает и защищает аккаунт той же блокировкой; после создания процесса зависимость хранится в реестре игры. Подготовка/игра A запрещает удаление A, но допускает удаление B. Local не ожидает глобальную блокировку удалённой авторизации.

RAII освобождает резервации при успехе, ошибке, отмене и прекращении future. Удаление очищает глобальный выбор и ссылки в метаданных/каталоге; tombstones защищают недоступные диски и позднее сохранение старых копий. Миры, моды, конфигурация и экземпляры не удаляются. Ошибки различают account_in_use_by_game, account_in_use_by_launch, account_removing и конфликт экземпляра/хранилища.

## Error UX

Единый RU/EN mapper принимает объект, JSON-строку и неизвестную ошибку. Основной текст объясняет причину и следующий шаг. Техническое сообщение, код, этап, название экземпляра, Task ID и retry находятся в закрытом Details; есть копирование. UUID не используется как основной текст. Dialog использует существующие focus/Escape/backdrop механизмы.

Retry показывается только при retryable и сохранённом исполняемом действии. Stop/Wait сохранены; Force stop имеет отдельное подтверждение. Создание экземпляра, Ely.by, Microsoft и поиск контента используют тот же mapper внутри своей формы; OTP и одноразовый пароль Ely.by сохранены.

## Activity

Активные операции отделены от истории. История содержит завершённые действия, аккаунты, Java, запуск/выход/ошибки игры и изменения контента. Ready отфильтрован, события отсортированы по времени и сгруппированы по датам; время HH:mm. Есть фильтры, компактные строки и объединение одинаковых ошибок за 5 минут.

История хранит до 300 событий за 30 дней. Clear требует подтверждения и очищает только историю. Установка контента не создаёт дополнительное ложное событие установки экземпляра.

## Game Logs

Отдельный viewer использует реальные файлы сессий Canary, названия экземпляров, версию Minecraft и статус. Выделены время/уровень/сообщение; поиск отложен, совпадения подсвечены, уровни фильтруются. React рендерит текст безопасно, ANSI удаляются, stack traces сохраняются.

Backend объединяет stdout/stderr, держит один buffered writer и отправляет пакеты каждые 50 ms или 256 строк. Файлы ротируются примерно при 5 MB, чтение ограничено хвостом 2 MB. UI сохраняет до 10 000 строк / 1 MB текста на сессию, до 20 буферов; список сессий ограничен 100. Слияние файла с поступившими строками линейное.

Viewer виртуализирует строки, поддерживает перенос и горизонтальную прокрутку. Scroll-up отключает следование, новые строки показывают New messages. Есть copy/open file/open folder, crash summary, первая ошибка и доступный crash report. Внутренние launcher-сообщения не смешиваются с игровыми.

## Performance

Причины slider lag: общий Appearance context обновлялся на каждый pixel; вместе с этим выполнялись запись localStorage, пересчёт визуальной среды и обновления потребителей. SmoothRange хранит drag локально, выводит значение сразу, применяет preview частиц непосредственно и фиксирует настройку по завершении drag/keyboard debounce. Повторный commit через pointer-up/lost-capture устранён.

localStorage записывается с задержкой 400 ms и flush при pagehide/unmount. Нативный материал получает зафиксированное значение через существующий debounce. Стабильные 24 частицы не пересоздаются при density/speed: меняются visibility, CSS и playbackRate. При скрытии окна анимации частиц приостанавливаются.

Высокочастотные logs/progress вынесены из Backend context в отдельные stores. Lifecycle-подписки обновляются при изменении состояния операции; progress/logs сгруппированы каждые 80 ms. Убрана безусловная запись каталога при каждом snapshot. Слушатели, timers, ResizeObservers и rAF очищаются. Nested blur исключён у вложенных контролов/панелей; предел blur 32 px, low-quality/reduced-transparency сохранены.

Проверены количество записей/IPC и ограничение DOM. Измерения устойчивых 60 FPS на пользовательском оборудовании и production GPU-profile не проводились.

## Minecraft Memory

Физическая RAM берётся из Win32 GlobalMemoryStatusEx. Глобально и отдельно для экземпляра доступны Auto/Manual, наследование, системный объём, рекомендация, выделенное значение и предупреждения. Старые настройки остаются Manual. Наследование очищает собственные min/max/mode.

Рекомендация независима от ограничения: до 4 GB Vanilla / 8 GB modded и половины физической RAM. Backend оставляет минимум 512 MB системе; UI использует шаг 1 GB. На моделируемой системе 64 GB сохранены 48 GB. Лимита 18 GB нет. Перенос с 64 GB на 16 GB проверяет clamp; запуск сообщает о коррекции.

Перед созданием команды Java удаляются пользовательские/metadata Xmx/Xms и конфликтующие XX heap/percentage аргументы. Добавляются ровно один Xms и Xmx; Xms меньше Xmx. JVM-переменные окружения, способные подменить аргументы, уже очищались и продолжают очищаться. Установленная Java 21 с -Xmx12G -XshowSettings:vm -version вернула Max. Heap Size: 12.00G. Это проверка JVM, а не запуск Minecraft с 12 GB.

## Visual Cleanup

Убраны декоративные рамки Activity, viewer логов, дорожек/ползунков, активных навигационных капсул и белая рамка иконки карточки. Контуры карточек/контролов используют border-subtle; функциональные разделители и keyboard focus ring сохранены.

## Vibrancy

Preset opacity 76%, blur 28 px и отдельный профиль: сильнее смешение цветов, мягкий theme tint, без glass shine и яркого внешнего stroke. Расчётный blur ограничен 32 px. В Light материал светлый, в AMOLED тёмный; кнопки и inputs не создают вложенный blur.

Glass, Clear Glass и Liquid Glass сохраняют разные opacity/blur/sheen-профили. Проверены четыре отличающиеся сигнатуры, отсутствие рамки sidebar/nested blur и размеры Settings в Dark/Light/AMOLED. Снимки этих тем просмотрены вручную. Это браузерные снимки с моделируемым IPC, не подтверждение Mica/Acrylic на каждом Windows build.

## Startup Splash

В основном окне сначала появляется logo 104 px по центру, затем смещается влево, а CANARY раскрывается через маску. Центрирование рассчитывается по естественной ширине группы и layout-ширине logo, независимо от анимированного scale. ResizeObserver обновляет геометрию.

Длительность 2.15 s; fallback cleanup 2.45 s. Фон — уже смонтированный интерфейс с blur/dim, который становится резким. Overlay удаляется, основной UI не пересоздаётся и навигация не повторяет заставку. Reduced motion — около 0.55 s. Геометрия первой/последней стадии и отсутствие повторного overlay проверены через rAF.

## QA

Реально выполнено:

- Rust: 81 passed, 0 failed, 6 ignored. Account-scoped launch/removal, 20 гонок Launch/Delete, другая операция/аккаунт, очистка выбора и поздних ссылок, сохранность world.dat, RAII cleanup, memory/Xmx и отсутствие дубля истории контента.
- В running-account тесте используется настоящий безвредный дочерний процесс, помещённый в реестр игры. Это не клиент Minecraft.
- Browser: 36 разных сценариев прошли в целевых прогонах. Прогон 34 дал 33 passed и timeout создания browser page; этот сценарий отдельно повторён успешно. Финальный целевой прогон 13/13; после последней CSS-правки 2/2.
- Создание Vanilla/Fabric/MRPACK через моделируемый IPC, ошибки RU/EN/Details/copy/Escape, Ely OTP, account/Play/Stop wiring, Force confirmation, stale provider responses, storage confirmation, RAM/inheritance/high allocation, simultaneous tasks/cancel/finalize, отсутствие Ready и очистка Activity без удаления логов.
- 10 000 коротких строк: меньше 80 DOM-строк, search/highlight/ANSI, scroll-up/New messages, отсутствие backend_snapshot при обычном log batch.
- 5000 длинных строк: buffer до 1 MB, wrap без горизонтального overflow, crash summary, error filter, copy/open-file wiring.
- 35 drag movements: 0 записей во время drag, 1 отложенная запись после, 0 новых IPC; 24 частицы.
- Startup geometry / one-shot cleanup; Vibrancy в трёх темах с Monocraft headings.

Не проверены: реальный вход Microsoft/Ely.by, полноценная сессия Minecraft, новая сетевая установка modpack, аппаратные FPS/GPU, все сочетания custom wallpaper/resize/DPI/material. Существующие сетевые integration tests оставлены ignored. Моделируемый browser IPC не выдаётся за нативный end-to-end.

## Build

- npm run build: exit 0, TypeScript + production Vite; main chunk 650.57 kB, CSS 142.28 kB. Сохраняется warning о chunk >500 kB.
- cargo check --manifest-path src-tauri/Cargo.toml: exit 0; существующие unused_mut/dead_code warnings в installer.rs.
- cargo test --lib --manifest-path src-tauri/Cargo.toml: exit 0, 81 passed / 6 ignored.
- npm run tauri dev: сборка завершилась; запущен .qa/rust-target/debug/scaffold.exe, создано окно Windows Canary с ненулевым MainWindowHandle. Полный ручной осмотр native UI не выполнялся.
- Первый native launch столкнулся с портом 1420 тестового сервера; повтор после завершения тестов успешен.
- Старый target после переноса содержал абсолютные пути прошлого диска. Использован чистый CARGO_TARGET_DIR=F:\Canary\.qa\rust-target; cache не коммитится.
- git diff --check: exit 0; только предупреждения LF/CRLF normalization.

## Git

Source of truth: https://github.com/ccardcat/canary, branch main.
Starting commit после fast-forward: ec65754e0a9b45fb292383848bbe8d196e15a0e1.
Точный final SHA и результат push публикуются в финальном сообщении; SHA коммита с этим отчётом определяется через git log -1.
Доставка: один commit исходников/tests/этого отчёта и обычный push origin main без force/reset/history rewrite. Перед push remote main проверен. Build artifacts, .qa, test-results, logs, secrets и cache исключены.
