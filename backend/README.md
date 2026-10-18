# API матчей Роналду

Из папки `backend/`:

```bash
npm ci
npm run dev
```

Ресурс: `http://localhost:3000/matches`. Отдельный матч: `/matches/{id}`.

`json-server` поддерживает `GET`, `POST`, `PATCH` и `DELETE`. Данные хранятся в `db.json`; при создании записи сервер назначает `id`. Количество голов (`goals`) хранится числом.

`ronaldoTeam` указывает команду Роналду, а `homeTeam` и `awayTeam` — хозяев и гостей матча.
