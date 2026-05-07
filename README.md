# Collaborative Developer Workspace (CCE)

A MEAN-stack collaborative coding workspace where users can create snippets, save code as version history, and collaborate in real time.

## Tech Stack

- Frontend: Angular + Tailwind CSS + Monaco Editor
- Backend: Node.js + Express.js + Socket.io
- Database: MongoDB (Mongoose)
- Infrastructure: Docker + Docker Compose

## Implemented Core Features

- Git-like snippet versioning (`versions[]` array with `code` + `timestamp`)
- REST APIs for create/read/update/history of snippets
- Real-time collaboration through Socket.io rooms
- Multi-service container setup (frontend + backend + mongo)

## Project Structure

```text
cce/
  backend/
    models/Snippet.js
    routes/snippets.js
    server.js
    Dockerfile
  frontend/
    src/app/services/snippet.service.ts
    src/app/services/socket.service.ts
    src/app/editor/editor.component.ts
    Dockerfile
  docker-compose.yml
```

## Prerequisites

### Required

- Docker Desktop (or Docker Engine) with Docker Compose v2

### Optional (for local, non-Docker run)

- Node.js 20+
- npm 10+
- MongoDB 7+
- Angular CLI (`npm i -g @angular/cli`)

## Important Note Before Running

This folder currently contains the **core feature files** requested (schema, routes, services, editor logic, and Docker definitions).

To run end-to-end, make sure these standard scaffold files also exist in your project:

- `backend/package.json` with dependencies and start script
- `frontend/package.json` and Angular workspace files (`angular.json`, `tsconfig*`, `src/main.ts`, `src/index.html`, etc.)
- `frontend/src/app/editor/editor.component.html` and `frontend/src/app/editor/editor.component.css`
- Angular environment files (for `apiUrl` and `socketUrl`)

If your project already has these, you can run immediately with the commands below.

## Run With Docker Compose (Recommended)

1. Open a terminal in the project root:

```bash
cd /home/abhinandh/Desktop/cce
```

2. Build and start all services:

```bash
docker compose up --build
```

3. Access services:

- Frontend: `http://localhost:4200`
- Backend health: `http://localhost:5000/health`
- MongoDB: `mongodb://localhost:27017`

4. Stop services:

```bash
docker compose down
```

5. Stop and remove Mongo data volume (fresh reset):

```bash
docker compose down -v
```

## Run Locally Without Docker

### 1) Start MongoDB

Make sure MongoDB is running on `mongodb://localhost:27017`.

### 2) Run Backend

From `backend/`:

```bash
cd /home/abhinandh/Desktop/cce/backend
npm install
```

Create `.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/collab_workspace
FRONTEND_URL=http://localhost:4200
```

Start server:

```bash
npm run dev
# or
npm start
```

### 3) Run Frontend

From `frontend/`:

```bash
cd /home/abhinandh/Desktop/cce/frontend
npm install
```

Set Angular environment values (for example in `src/environments/environment.ts`):

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000',
  socketUrl: 'http://localhost:5000'
};
```

Start Angular app:

```bash
ng serve --host 0.0.0.0 --port 4200
```

## API Reference

Base URL: `http://localhost:5000/api/snippets`

- `POST /` - Create snippet (first version)
- `GET /` - List snippets (latest version only)
- `GET /:id` - Get full snippet document
- `PUT /:id` - Save new version (append to `versions[]`)
- `GET /:id/history` - Get complete version history

### Create snippet example

```bash
curl -X POST http://localhost:5000/api/snippets \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sample Snippet",
    "language": "javascript",
    "code": "console.log(\"hello\")"
  }'
```

### Save new version example

```bash
curl -X PUT http://localhost:5000/api/snippets/<SNIPPET_ID> \
  -H "Content-Type: application/json" \
  -d '{
    "code": "console.log(\"hello v2\")",
    "title": "Sample Snippet",
    "language": "javascript"
  }'
```

## Socket.io Events

Client emits:

- `join-snippet` with `snippetId`
- `leave-snippet` with `snippetId`
- `code-change` with `{ snippetId, code }`

Client listens:

- `remote-code-change` -> `{ snippetId, code, updatedAt }`
- `snippet-version-created` -> `{ snippetId, version, updatedAt }`

## Troubleshooting

- Port already in use:
  - Stop conflicting process or change ports in `docker-compose.yml`.
- Mongo connection errors:
  - Verify `MONGO_URI` and ensure mongo container/service is running.
- CORS issues:
  - Confirm backend `FRONTEND_URL` matches frontend origin.
- Frontend build fails in Docker:
  - Ensure `frontend/package.json` has a valid `build` script and Angular workspace files are present.

## Next Recommended Enhancements

- Add authentication and per-user snippet ownership
- Add role-based sharing permissions
- Add conflict resolution (OT/CRDT) for advanced collaboration
- Add automated tests for API routes and socket events
