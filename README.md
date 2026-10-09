# Collaborative Developer Workspace

[![CI](https://github.com/abhinandh23/CollaborativeWorkspace/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/abhinandh23/CollaborativeWorkspace/actions/workflows/ci.yml)

A production-ready, full-stack collaborative developer workspace built with React, Django, and WebSockets. This application allows multiple users to edit code in real-time, execute Python code directly from the browser, and communicate via a synchronized workspace chat.

## Features

- **Real-Time Code Sync:** Powered by Django Channels, Redis, and WebSockets, users experience instant code syncing.
- **Live Workspace Chat:** A fully synchronized chat system allowing developers to communicate while coding.
- **Native Python Execution:** Users can execute their Python scripts safely in the browser using a custom native execution engine.
- **Modern UI/UX:** Built with React, Vite, Shadcn UI, and TailwindCSS for a premium, dark-mode-first aesthetic (Zinc theme).
- **Robust Authentication:** Secure JWT (JSON Web Token) authentication system.
- **Containerized Infrastructure:** Easily deployable using Docker, PostgreSQL, and Redis.

## Tech Stack

### Frontend
- **Framework:** React + Vite
- **Styling:** TailwindCSS + Shadcn UI
- **Editor:** Monaco Editor (`@monaco-editor/react`)
- **Routing:** React Router v6
- **HTTP Client:** Axios (with automatic JWT Interceptors)

### Backend
- **Framework:** Django 5.0 + Django REST Framework
- **WebSockets:** Django Channels + Daphne + Redis
- **Database:** PostgreSQL (`psycopg[binary]`)
- **Authentication:** Simple JWT

### Infrastructure
- **Containerization:** Docker & Docker Compose
- **Services:** Postgres (Database) & Redis (Message Broker)

## Local Setup Instructions

### Prerequisites
Make sure you have the following installed on your machine:
- Node.js & npm
- Python 3.10+
- Docker Desktop (for Postgres and Redis)

### 1. Start Infrastructure Services
Start the PostgreSQL and Redis containers using Docker Compose:
```bash
docker-compose up -d
```

### 2. Backend Setup (Django)
Open a terminal in the project root and navigate to the backend:
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # On Windows
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start the Django server (port 8001 to avoid conflicts)
python manage.py runserver 8001
```

### 3. Frontend Setup (React)
Open a second terminal in the project root and navigate to the frontend:
```bash
cd frontend
npm install

# Start the Vite development server
npm run dev
```

### 4. Access the App
Open your browser and navigate to `http://localhost:5173`. Register an account, create a workspace, and share the URL with a friend to start collaborating!

---

## Testing & CI

### What CI does
[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push to `main` and every pull request targeting `main`. A newer push cancels a run still in progress on the same branch. Two jobs run in parallel, and the workflow fails if any test fails:

- **Backend:** Python 3.13 with PostgreSQL 15 and Redis 7 service containers. Runs `pytest` with coverage, using the real Redis channel layer for the WebSocket tests.
- **Frontend:** Node 22. Runs `npm ci`, then Jest with coverage.

Each job writes a coverage summary to the run page and uploads its coverage report (`backend-coverage`, `frontend-coverage`) as a workflow artifact. CI uses dummy credentials that only work with its own throwaway database and Redis; no secrets are needed.

### Frontend (Jest + React Testing Library)
```bash
cd frontend
npm test                 # run once
npm run test:coverage    # with a coverage report
```
Tests live in `frontend/tests/`. Monaco Editor, the Google login button, `WebSocket` and the API client are mocked, so no backend is needed.

### Backend (pytest)
Needs Postgres from `docker-compose up -d db redis`; pytest-django creates and drops a separate `test_collabdb` database.
```bash
cd backend
pip install -r requirements-dev.txt
pytest                   # run once
pytest --cov             # with coverage
```
Tests live in `backend/tests/`. Google token verification and the `docker run` call are mocked, so no external services are contacted and no containers start. WebSocket tests use an in-memory channel layer; set `TEST_CHANNEL_LAYER=redis` to run them through the real Redis (CI does this).

### API collection (Postman / Newman)
This one runs manually; it isn't part of CI. `postman/collection.json` is an end-to-end run against a live backend: it registers a fresh user, logs in, creates a workspace, exercises files, chat history and code execution, then deletes the workspace. Each request asserts its status code and response shape.

1. Start the backend on port 8001 (see step 2 above).
2. Run:
   ```bash
   npx newman run postman/collection.json -e postman/environment.json
   ```
To target another server, change `baseUrl` in `postman/environment.json`, or pass `--env-var baseUrl=https://your-backend/api`. You can also import both files into Postman and use the Collection Runner. Run the folders in order, since later requests use the tokens and IDs saved by earlier ones.

Each run leaves one `newman_…@example.com` test user in the database.

---


