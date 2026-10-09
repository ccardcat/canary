# CurseForge для всех пользователей Canary

Рабочий адрес: **https://canaryclientcurseforge.forwildcraft222.workers.dev**. Ключ хранится только в существующем Cloudflare Secret `CURSEFORGE_API_KEY`. Пользователям вводить ключ не требуется.

## Текущий статус и согласование

9 октября 2026 года существующее подключение Cloudflare Builds автоматически создало новую версию после security push в `main`. Проверка `/health` с User-Agent Canary вернула `protocol: 2`, `configured: true`, `rateLimiting: true`, `gatewayApproved: false`, `ready: false`, `reason: "terms_approval_required"`. Health не обращался к API издателя. Владелец подтвердил выдачу ключа, но отдельное согласование публичного gateway не установлено.

[Условия стороннего API, пункт 3.1](https://support.curseforge.com/support/solutions/articles/9000207405-curseforge-3rd-party-api-terms-and-conditions) ограничивают proxy/VPN при сокрытии идентичности или местоположения, запрещают сохранение/кэширование данных API и ограничивают конкурирующие сервисы. Явного разрешения этой серверной схеме из публичных условий не следует. Для публичного включения нужно письменное подтверждение CurseForge. У ранее подготовленного Worker теперь удалён кэш API; маршруты сервиса выключены по умолчанию. Health показывает безопасный статус без секретов.

Отправьте через канал, где получили ключ, следующий запрос. Сам ключ в письмо не вставляйте:

> We received an API key for Canary, an open-source Minecraft launcher: https://github.com/ccardcat/canary. Please confirm in writing that our approved application may use a developer-operated Cloudflare Worker gateway for all Canary users, without distributing the API key to desktop clients. It identifies Canary, exposes only specific read-only Minecraft routes, enforces rate limits, and never saves/caches API responses or archives. Downloads stream from the official CDN using our key and respect permissions, allowModDistribution, isAvailable and missing downloadUrl. The launcher retains installed file hashes and project/version IDs locally for integrity, updates and rollback. Please confirm this architecture, file streaming, local installation records and any additional agreement, attribution, geographic reporting or limits required for Canary.

Настройку `CURSEFORGE_GATEWAY_APPROVED=true` добавляйте только после отдельного подтверждения. Наличие ключа само по себе не подтверждает разрешение gateway.

## Публикация через Cloudflare, без программирования

После проверки согласования и квот Cloudflare может применить подготовленный код, Durable Object и лимиты из GitHub. В рамках аудита публикация не выполнялась. Команды на компьютере выполнять не нужно.

1. Войдите на https://dash.cloudflare.com/.
2. Откройте **Workers & Pages → canaryclientcurseforge**.
3. Выберите **Settings → Builds → Connect**.
4. Выберите **GitHub**, предоставьте доступ к **ccardcat/canary** и выберите этот репозиторий.
5. Ветка: **main**.
6. Поле **Root directory / Path**: `services/curseforge-gateway`.
7. Поле **Build command**: `npm ci`.
8. Поле **Deploy command**: `npx wrangler deploy`.
9. Сохраните подключение. Нажмите **Save and Deploy**, если панель предлагает эту кнопку. Если сборка не стартовала, в разделе **Builds / Deployments** используйте предложенную повторную сборку (**Retry / Redeploy**). Последующие обновления main запускают сборку автоматически.
10. Дождитесь успешного завершения. Имя в конфигурации уже совпадает с вашим Worker: **canaryclientcurseforge**.
11. В **Settings → Variables and Secrets** проверьте наличие Secret `CURSEFORGE_API_KEY`. Значение раскрывать или переносить в GitHub не нужно.
12. **После письменного подтверждения CurseForge** измените `vars.CURSEFORGE_GATEWAY_APPROVED` в `wrangler.jsonc` с `false` на `true` и зафиксируйте согласованные квоты. До подтверждения в репозитории оставляйте `false`: последующая автосборка снова применяет это значение. Значение ключа по-прежнему хранится только как Cloudflare Secret.

Подключение существующего Worker описано в [документации Cloudflare Builds](https://developers.cloudflare.com/workers/ci-cd/builds/). Rate-limit bindings пока [не видны в панели](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/); сборка применяет три готовых binding из `wrangler.jsonc` автоматически. Не нужно искать несуществующую кнопку их добавления.

## Конфигурация общего бюджета

Worker использует два исходника (`worker.mjs` и `budget.mjs`), Durable Object `GatewayBudget`, миграцию SQLite и пять обязательных параметров бюджета. Публикуйте весь каталог через Builds с `wrangler.jsonc`: вставка одного файла в Edit Code не создаёт эти ресурсы.

До публичного включения согласуйте квоты с CurseForge и владельцем Cloudflare. Значения в репозитории — пример конфигурации, **не подтверждённые издателем квоты**:

| Параметр | Пример | Назначение |
| --- | ---: | --- |
| `GATEWAY_API_PER_MINUTE` | 5000 | Все реальные обращения к API в минуту |
| `GATEWAY_API_PER_DAY` | 100000 | Все реальные обращения к API за UTC-сутки |
| `GATEWAY_DOWNLOADS_PER_MINUTE` | 1000 | Допуски к скачиванию и HEAD в минуту |
| `GATEWAY_BYTES_PER_DAY` | 1099511627776 | Резервируемые байты за UTC-сутки (1 TiB) |
| `GATEWAY_CONCURRENT_DOWNLOADS` | 128 | Одновременные потоковые передачи |

Один объект `publisher-global` атомарно считает обращения из всех расположений Cloudflare. Каждый upstream API fetch оплачивается отдельным допуском, включая два запроса метаданных для одной загрузки. Объём резервируется до обращения к CDN и не возвращается после отмены: повторные отмены не обходят суточный предел. Lease освобождается при завершении/ошибке/отмене и автоматически истекает через 310 секунд. Передача ограничена 300 секундами и 16 GiB на файл; range проверяется и резервируется отдельно.

Отсутствующий binding, неверные/отсутствующие квоты или недоступный объект блокируют обращения. Объект хранит только счётчики и временные идентификаторы передачи; ответы API и архивы в него не записываются. В конфигурации явно задано `CURSEFORGE_GATEWAY_APPROVED=false`, поэтому новая автопубликация применяет выключенный режим. Обнаруженное существующее подключение Builds уже создало версию Worker после security push; фактический health и положение публичного флага требуют отдельной проверки в Cloudflare.

## Проверка в браузере и Canary

- [Health](https://canaryclientcurseforge.forwildcraft222.workers.dev/health): до согласования ожидается `ready: false`. `terms_approval_required` означает ожидание разрешения; `missing_rate_bindings` означает, что не применена конфигурация сборки.
- [Проверка API](https://canaryclientcurseforge.forwildcraft222.workers.dev/health?check=api): после разрешения и настройки ожидаются `ready: true` и `api: "reachable"`. Без подтверждения этот маршрут не обращается к CurseForge. Статус `unavailable` не раскрывает закрытые ответы авторизации.
- [Поиск одного мода](https://canaryclientcurseforge.forwildcraft222.workers.dev/v1/mods/search?gameId=432&classId=6&pageSize=1): после включения ожидается JSON с `data` и проектом, до включения — безопасный отказ.
- [Проверка неверной игры](https://canaryclientcurseforge.forwildcraft222.workers.dev/v1/mods/search?gameId=1): ожидается HTTP 400 без запроса к CurseForge.

После публикации и разрешения обновите Canary. В **Discover → CurseForge → Mods** найдите **Fabric API**, выберите существующую сборку **Minecraft 1.21.1 / Fabric**, проверьте зависимости и подтвердите установку. Операция появится в **Downloads**, файл — в контенте сборки. Проекты с запретом автора или без разрешённой ссылки требуют ручной загрузки с официальной страницы.

Health не доказывает успешную установку. Отдельно проверяются поиск, список файлов, настоящая загрузка, хэш и запись в сборке. До этих проверок интеграция не объявляется готовой.

## Защита и работа сервиса

- Только конкретные GET-маршруты Minecraft; HEAD используется для скачивания. Произвольных URL, общего проксирования и записи нет.
- URL ограничен 2048 символами, заголовки — 8192 байтами. Тело запроса запрещено. Проверяются фильтры, ID, страницы и дубли параметров; JSON ограничен 8 MiB.
- Edge-лимиты: 600 запросов API и 300 скачиваний в минуту на IP, 5000 запросов в минуту на расположение Cloudflare. Это предварительное сглаживание нагрузки. Общий бюджет API, байтов и одновременных передач дополнительно обеспечивается Durable Object из предыдущего раздела. Фиксированные минутные/суточные окна допускают всплеск на границе окон; анонимные пользователи могут исчерпать квоту для остальных.
- Кэш API и архивов не используется, fetch и ответы имеют no-store. Архивы передаются потоком.
- x-api-key отправляется только точным официальным адресам. Переадресации проверяются до передачи ключа. Ключ, cookies и закрытые ошибки не возвращаются клиентам и не логируются кодом.
- Подписанная ссылка связана с project/file ID и действует 30 минут. Она разрешает скачать файл, но не доказывает, что клиент — Canary. Общий секрет в desktop-клиенте не используется как защита.
- Лаунчер проверяет хэши/размеры и сохраняет существующие отмену и транзакционную установку.

Адрес Worker уже включён в исходный клиент. Canary включает источник только после проверки безопасного health и доступности API. Старые установщики нужно заменить новой сборкой. GitHub Actions Variable `CANARY_CURSEFORGE_PROXY_URL` остаётся необязательным способом сменить публичный адрес; ключ в неё не записывается.

Для разработчиков: `npm test` и `npx wrangler deploy --dry-run` проверяют исходник с синтетическими ключами. Живой тест `real_gateway_mod_install` запускается отдельно, только после разрешения и публикации; он использует временную сборку и настоящий разрешённый файл.
