# orders-aggregator

Решение тестового задания на сервис статистики заказов. Готовый ответ для клиента `c_7` лежит в [`result.json`](result.json), разбор причины расхождения и проверок — в [`SOLUTION.md`](SOLUTION.md).

Сервис забирает заказы интернет-магазина из внешней системы (API поддерживает другая команда),
принимает их обновления через вебхуки и считает статистику по клиентам.

## Как работает

1. `POST /sync` последовательно забирает страницы заказов из внешнего API и сохраняет более свежие версии по `updatedAt`.
2. `POST /webhooks/order` применяет последующие изменения заказов; повторные и устаревшие события игнорируются.
3. `GET /customers/:id/daily-totals` берёт оплаченные заказы, определяет локальный день каждого заказа по таймзоне клиента и суммирует `gross` и `net` в копейках. `discount` — их разница, `total` оставлен для совместимости и равен `gross`.

Для локального запуска нужен образ `orders-mock:3` из исходного пакета задания (`orders-mock-arm64.tar.gz` или `orders-mock-amd64.tar.gz`). Сам образ в репозиторий не включён.

## Стек

Node 20+, TypeScript, Fastify, PostgreSQL (`pg`), Zod, Vitest.

## Запуск

Образ внешнего API лежит рядом с этой папкой — загрузите тот, что под вашу архитектуру (`uname -m`):

```bash
docker load -i ../orders-mock-arm64.tar.gz   # arm64 / aarch64 (Mac на Apple Silicon)
docker load -i ../orders-mock-amd64.tar.gz   # x86_64
```

```bash
cp .env.example .env
docker compose up -d        # PostgreSQL на :55432 (+ orders_test), внешний API на :4000
npm install
npm run migrate
npm run dev                 # http://localhost:3000
```

Отправка вебхуков из внешней системы (для разработки запускается вручную, сервис должен быть запущен):

```bash
docker compose run --rm orders-api webhooks --target http://host.docker.internal:3000/webhooks/order
```

Тесты (нужен запущенный PostgreSQL):

```bash
npm test
```

## Структура

```
src/
  app.ts              Fastify-приложение, обработка ошибок
  container.ts        сборка зависимостей
  db.ts               пул соединений, миграции
  clients/            клиент внешнего API (лимиты, ретраи)
  repositories/       доступ к данным
  services/           бизнес-логика
  routes/             HTTP-слой
  utils/              деньги, время
migrations/           SQL-миграции, применяются по порядку
test/                 интеграционные тесты на реальной БД (внешний API — фейк)
```

## Соглашения

- Деньги внутри сервиса — в копейках (integer). Рубли — только на входе из внешнего API и в ответах.
- Время храним в UTC (`TIMESTAMPTZ`).
- Ошибки бизнес-логики — наследники `AppError`, в ответе `{ error: <код>, message }`.

## API сервиса

| Метод | Путь | Описание |
|---|---|---|
| POST | `/sync` | Забрать все заказы из внешнего API. Отвечает статистикой, когда всё забрано |
| POST | `/webhooks/order` | Обновление заказа (тело — `Order` внешнего API). Повтор/устаревшая версия → `200 { result: "stale" }` |
| GET | `/customers/:id/daily-totals?from=YYYY-MM-DD&to=YYYY-MM-DD` | Оплаченные (`paid`) заказы по дням в таймзоне клиента: `[{ date, total, gross, discount, net }]` |
| GET | `/health` | Проверка живости |

## Внешний API (`ORDERS_API_URL`)

- `GET /orders?cursor=<string>&limit=<1..100>` → `{ items: Order[], nextCursor: string | null }`. Лимит 5 rps.
- `GET /customers/:id` → `{ id, timezone }` (IANA, например `Europe/Berlin`).
- Вебхуки: `POST` на наш `/webhooks/order`, тело — `Order`. Повторная доставка возможна.

```ts
type Order = {
  id: string;
  customerId: string;
  amount: number;          // сумма заказа в рублях, до скидки
  discountPercent: number; // скидка, % (0 — без скидки)
  amountPaid: number;      // оплачено, в рублях: amount со скидкой
  status: "pending" | "paid" | "refunded";
  createdAt: string;       // ISO 8601, UTC
  updatedAt: string;       // ISO 8601, UTC
};
```

`amountPaid` используется как фактически оплаченная сумма; `discountPercent` валидируется, но сумма скидки вычисляется как разница между `amount` и `amountPaid`. Для старых записей без новых полей оплаченная сумма принимается равной сумме заказа.

`total` сохраняет прежнее значение и равно `gross` (сумма до скидки). `discount = gross - net`; все суммы возвращаются в рублях.
