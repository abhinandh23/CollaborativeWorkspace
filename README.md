# Collaborative Developer Workspace (CCE)

Real-time collaborative code editor with version control for code snippets.

## Features

- **Versioned Snippets**: Git-like versioning where each save appends to a `versions[]` array with code and timestamp.
- **Real-Time Collaboration**: Multi-user editing in Socket.io rooms with live code updates.
- **Monaco Editor**: Full-featured code editor UI with syntax highlighting.
- **REST API**: CRUD operations for snippets and history retrieval.
- **Dockerized**: Easy setup with Docker Compose for frontend, backend, and MongoDB.

## Tech Stack

- **Frontend**: Angular 17, Tailwind CSS, Monaco Editor
- **Backend**: Node.js, Express.js, Socket.io
- **Database**: MongoDB with Mongoose
- **Infrastructure**: Docker, Docker Compose

## Prerequisites

- Docker and Docker Compose (recommended)
- Node.js 20+ and npm (for local dev)
- MongoDB (for local dev)

## Installation

### Docker (Recommended)

Clone or navigate to the project folder:

```bash
cd /home/abhinandh/Desktop/cce
docker compose up --build
```

This builds and starts all services.

### Local Development

#### Backend

```bash
cd /home/abhinandh/Desktop/cce/backend
npm install
```

Create `.env` file:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/collab_workspace
FRONTEND_URL=http://localhost:4200
```

#### Frontend

```bash
cd /home/abhinandh/Desktop/cce/frontend
npm install
```

## Running the Project

### Docker

```bash
cd /home/abhinandh/Desktop/cce
docker compose up --build
```

- Frontend: http://localhost:4200
- Backend: http://localhost:5000

### Local

#### Backend

```bash
cd /home/abhinandh/Desktop/cce/backend
npm run dev
```

#### Frontend

```bash
cd /home/abhinandh/Desktop/cce/frontend
npm start
```

Ensure MongoDB is running locally.

## API Endpoints

Base URL: `http://localhost:5000/api/snippets`

- `POST /` - Create snippet
- `GET /` - List snippets
- `GET /:id` - Get snippet
- `PUT /:id` - Save new version
- `GET /:id/history` - Get history

## Socket.io Events

- Client emits: `join-snippet`, `leave-snippet`, `code-change`
- Client listens: `remote-code-change`, `snippet-version-created`

## Troubleshooting

- For Monaco compatibility, use `ngx-monaco-editor-v2@17.0.1` in Angular 17.
- Reset DB: `docker compose down -v`
- Ports: Ensure 4200, 5000, 27017 are free.
