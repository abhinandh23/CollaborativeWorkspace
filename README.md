# Collaborative Developer Workspace

A production-ready, full-stack collaborative developer workspace built with React, Django, and WebSockets. This application allows multiple users to edit code in real-time, execute Python code directly from the browser, and communicate via a synchronized workspace chat.

## 🚀 Features

- **Real-Time Code Sync:** Powered by Django Channels, Redis, and WebSockets, users experience instant code syncing.
- **Live Workspace Chat:** A fully synchronized chat system allowing developers to communicate while coding.
- **Native Python Execution:** Users can execute their Python scripts safely in the browser using a custom native execution engine.
- **Modern UI/UX:** Built with React, Vite, Shadcn UI, and TailwindCSS for a premium, dark-mode-first aesthetic (Zinc theme).
- **Robust Authentication:** Secure JWT (JSON Web Token) authentication system.
- **Containerized Infrastructure:** Easily deployable using Docker, PostgreSQL, and Redis.

## 🛠️ Tech Stack

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

## 💻 Local Setup Instructions

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

*Built from scratch as a mastery project for advanced software engineering architecture.*
