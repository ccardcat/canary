# CurseForge для всех пользователей Canary

Рабочий адрес: **https://canaryclientcurseforge.forwildcraft222.workers.dev**. Ключ хранится только в существующем Cloudflare Secret `CURSEFORGE_API_KEY`. Пользователям вводить ключ не требуется.

## Текущий статус и согласование

8 октября 2026 года Worker отвечал `Hello World!` на health и поиск. Исходник интеграции ещё не опубликован. Владелец подтвердил выдачу ключа, но не отдельное согласование gateway.

[Условия стороннего API, пункт 3.1](https://support.curseforge.com/support/solutions/articles/9000207405-curseforge-3rd-party-api-terms-and-conditions) ограничивают proxy/VPN при сокрытии идентичности или местоположения, запрещают сохранение/кэширование данных API и ограничивают конкурирующие сервисы. Явного разрешения этой серверной схеме из публичных условий не следует. Для публичного включения нужно письменное подтверждение CurseForge. У ранее подготовленного Worker теперь удалён кэш API; маршруты сервиса выключены по умолчанию. Health показывает безопасный статус без секретов.

Отправьте через канал, где получили ключ, следующий запрос. Сам ключ в письмо не вставляйте:

> We received an API key for Canary, an open-source Minecraft launcher: https://github.com/ccardcat/canary. Please confirm in writing that our approved application may use a developer-operated Cloudflare Worker gateway for all Canary users, without distributing the API key to desktop clients. It identifies Canary, exposes only specific read-only Minecraft routes, enforces rate limits, and never saves/caches API responses or archives. Downloads stream from the official CDN using our key and respect permissions, allowModDistribution, isAvailable and missing downloadUrl. The launcher retains installed file hashes and project/version IDs locally for integrity, updates and rollback. Please confirm this architecture, file streaming, local installation records and any additional agreement, attribution, geographic reporting or limits required for Canary.

Настройку `CURSEFORGE_GATEWAY_APPROVED=true` добавляйте только после отдельного подтверждения. Наличие ключа само по себе не подтверждает разрешение gateway.

## Публикация через Cloudflare, без программирования

Cloudflare сам применит подготовленный код и лимиты запросов из GitHub. Команды на компьютере выполнять не нужно.

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
12. **После письменного подтверждения CurseForge** нажмите **Add**, тип **Text**, имя `CURSEFORGE_GATEWAY_APPROVED`, значение `true`. Сохраните и подтвердите предлагаемую публикацию (**Deploy**).

Подключение существующего Worker описано в [документации Cloudflare Builds](https://developers.cloudflare.com/workers/ci-cd/builds/). Rate-limit bindings пока [не видны в панели](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/); сборка применяет три готовых binding из `wrangler.jsonc` автоматически. Не нужно искать несуществующую кнопку их добавления.

## Как вставить файл через Edit Code

Этот способ позволяет заменить заготовку и проверить health. Для полноценного включения лимитов всё равно понадобится подключение GitHub из предыдущего раздела.

1. Откройте в проекте **services/curseforge-gateway/src/worker.mjs**. На GitHub: [исходный файл](https://github.com/ccardcat/canary/blob/main/services/curseforge-gateway/src/worker.mjs). Кнопка **Raw** открывает только код.
2. Скопируйте весь файл: **Ctrl+A → Ctrl+C**. Ключа в этом файле нет.
3. В Cloudflare откройте **canaryclientcurseforge → Edit Code**.
4. Выберите основной файл, обычно **worker.js**, выделите весь стандартный код и вставьте скопированный текст.
5. Нажмите **Deploy** и подтвердите публикацию.
6. В **Settings → Runtime** дата совместимости должна быть не раньше **2024-11-11**. Конфигурация проекта устанавливает **2026-10-08**.
7. Откройте health по ссылке ниже: вместо Hello World должен появиться JSON с `canary-curseforge`.

Вставка исходника не создаёт rate-limit bindings. Пока они отсутствуют, health показывает `missing_rate_bindings`, а API выключен. Примените конфигурацию через GitHub Builds. Так код не запускает публичный сервис без обязательных ограничений.

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
- Лимиты: 600 запросов API и 300 скачиваний в минуту на IP, 5000 запросов в минуту на расположение Cloudflare. Это не глобальный предел оплаты. Общие IP, квоты и план аккаунта учитываются по реальному трафику.
- Кэш API и архивов не используется, fetch и ответы имеют no-store. Архивы передаются потоком.
- x-api-key отправляется только точным официальным адресам. Переадресации проверяются до передачи ключа. Ключ, cookies и закрытые ошибки не возвращаются клиентам и не логируются кодом.
- Подписанная ссылка связана с project/file ID и действует 30 минут. Она разрешает скачать файл, но не доказывает, что клиент — Canary. Общий секрет в desktop-клиенте не используется как защита.
- Лаунчер проверяет хэши/размеры и сохраняет существующие отмену и транзакционную установку.

Адрес Worker уже включён в исходный клиент. Canary включает источник только после проверки безопасного health и доступности API. Старые установщики нужно заменить новой сборкой. GitHub Actions Variable `CANARY_CURSEFORGE_PROXY_URL` остаётся необязательным способом сменить публичный адрес; ключ в неё не записывается.

Для разработчиков: `npm test` и `npx wrangler deploy --dry-run` проверяют исходник с синтетическими ключами. Живой тест `real_gateway_mod_install` запускается отдельно, только после разрешения и публикации; он использует временную сборку и настоящий разрешённый файл.
