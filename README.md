# Collaborative Developer Workspace (CCE)

Real-time code collaboration workspace built with Angular, Express, MongoDB, and Socket.io.

## Key Features

- Versioned snippets (every save appends a new entry to `versions[]`, no overwrite)
- Snippet history endpoint for full version timeline
- Live multi-user editing in snippet-specific Socket.io rooms
- Monaco-based code editor UI
- Dockerized full-stack setup (frontend + backend + mongo)

## Stack

- Frontend: Angular 17, Tailwind CSS, Monaco Editor (`ngx-monaco-editor-v2`)
- Backend: Node.js, Express.js, Socket.io
- Database: MongoDB + Mongoose
- Orchestration: Docker Compose

## Quick Start (Recommended)

### Prerequisites

- Docker + Docker Compose

### Run

```bash
cd /home/abhinandh/Desktop/cce
docker compose up --build
```

### Open

- Frontend: `http://localhost:4200`
- Backend health: `http://localhost:5000/health`

### Stop

```bash
docker compose down
```

## Local Run (Without Docker)

### 1) Backend

```bash
cd /home/abhinandh/Desktop/cce/backend
npm install
```

Create `backend/.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/collab_workspace
FRONTEND_URL=http://localhost:4200
```

Start backend:

```bash
npm run dev
# or
npm start
```

### 2) Frontend

```bash
cd /home/abhinandh/Desktop/cce/frontend
npm install
npm start
```

## API Endpoints

Base: `http://localhost:5000/api/snippets`

- `POST /` -> create snippet (first version)
- `GET /` -> list snippets (latest version preview)
- `GET /:id` -> full snippet
- `PUT /:id` -> save new version
- `GET /:id/history` -> version history

## Real-Time Events

Client emits:

- `join-snippet`
- `leave-snippet`
- `code-change`

Client listens:

- `remote-code-change`
- `snippet-version-created`

## Notes

- For Angular 17 compatibility, use `ngx-monaco-editor-v2@17.0.1`.
- If you want a clean DB reset: `docker compose down -v`.
