# 🧠 Code Graph Explorer — MVP (Stage 4)

[![E2E API](https://github.com/jerome244/code_graph_explorer/actions/workflows/e2e.yml/badge.svg)](https://github.com/jerome244/code_graph_explorer/actions/workflows/e2e.yml)

**Team:** Pierre Lionnel Obiang • Ryota Higa • Jérôme Tran  
**Project:** Holberton Portfolio Project — Stage 4 (MVP Development and Execution)  
**Instructor:** Javier Valenzani  

---

## 🚀 Overview

**Code Graph Explorer** is a collaborative visualization and exploration tool for software codebases.  
It allows users to:
- Register & authenticate securely (JWT-based auth)
- Create and manage projects
- Add files, metadata, and graph relationships
- (Future) Share projects with collaborators

This MVP demonstrates a fully functional **Django + DRF backend** with **PostgreSQL** and **automated QA validation**.

---

## 📅 Stage 4 Deliverables (for Evaluation)

| Deliverable | Description | Link |
|--------------|--------------|------|
| **Sprint Planning** | Taiga backlog & sprint board | 🔗 [Taiga Board](https://tree.taiga.io/project/jerome244-code-graph-explorer/backlog) |
| **Source Repository** | Backend + tests source code | 🔗 [GitHub Repo](https://github.com/jerome244/code_graph_explorer/tree/tests) |
| **Bug Tracking** | Taiga issue tracker | 🔗 [Taiga Issues](https://tree.taiga.io/project/jerome244-code-graph-explorer/issues) |
| **Testing Evidence** | Automated & manual QA proof | 🔗 [CI Run Logs](https://github.com/jerome244/code_graph_explorer/actions/runs/18445306878) |
| **Production / Staging Environment** | Docker-based setup | 📦 See below |

---

## 🧩 Technical Stack

| Layer | Tech |
|-------|------|
| Backend | Django 5 + Django REST Framework |
| Database | PostgreSQL 16 (Dockerized) |
| Auth | JWT via `djangorestframework-simplejwt` |
| Testing | `pytest`, `requests`, custom curl e2e script |
| CI | GitHub Actions (`.github/workflows/e2e.yml`) |
| Deployment | Docker Compose / local development |

---

## 🧪 Testing & QA Evidence

### ✅ Automated E2E Tests

The project includes **two QA suites**:

#### 1. Shell E2E Test (smoke)
File: [`tests/run_e2e.sh`](./tests/run_e2e.sh)

```bash
./tests/run_e2e.sh
```

This script:

Starts PostgreSQL via Docker

Creates a virtualenv & installs dependencies

Runs database migrations

Launches Django

Registers a user

Logs in

Creates a project and file

Confirms everything works (✅ Done message)

Sample Output:
```
✅ Done. Saved env to tests/.e2e.env
```

2. Pytest API Suite

File: tests/api/test_e2e.py

Command:
```
pytest -q tests/api --maxfail=1 --disable-warnings
```

Example result:
```
....s.                                         [100%]
5 passed, 1 skipped in 6.27s
```

The tests verify:

Unauthorized access returns 401

Registration + login (JWT auth)

Projects: list, create, detail, patch, delete

File creation within projects

Cross-user isolation (no leaks between users)

Optional token refresh flow

(Skipped for now) Collaboration/sharing endpoint

🧰 CI Workflow

Automated GitHub Actions workflow:
📄 .github/workflows/e2e.yml
Runs the same tests on every push.

Badge above shows latest run status.
Latest successful run logs: CI Run Logs

🧰 Local Development Setup
1. Start PostgreSQL
```
docker run --name cgx-pg \
  -e POSTGRES_DB=code_graph_explorer \
  -e POSTGRES_USER=codegraph \
  -e POSTGRES_PASSWORD=007 \
  -p 5432:5432 -d postgres:16
```

cd backend
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export DB_NAME=code_graph_explorer
export DB_USER=codegraph
export DB_PASSWORD=007
export DB_HOST=127.0.0.1
export DB_PORT=5432

python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

🧱 Docker Compose (Staging / Production)

Create a file named docker-compose.yml:
```
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: code_graph_explorer
      POSTGRES_USER: codegraph
      POSTGRES_PASSWORD: 007
    ports:
      - "5432:5432"
  backend:
    build: ./backend
    command: >
      sh -c "python manage.py migrate &&
             python manage.py runserver 0.0.0.0:8000"
    environment:
      DB_NAME: code_graph_explorer
      DB_USER: codegraph
      DB_PASSWORD: 007
      DB_HOST: db
      DB_PORT: 5432
    ports:
      - "8000:8000"
    depends_on:
      - db
```

Then start:
```
docker compose up -d
```

Backend available at:
👉 http://127.0.0.1:8000/api/projects/

## 🧪 Manual QA Checklist

| Step | Endpoint | Expected |
|------|-----------|-----------|
| 1 | `GET /api/projects/` | 401 Unauthorized |
| 2 | `POST /api/auth/register/` | 201 Created (user registered) |
| 3 | `POST /api/auth/token/` | 200 OK (JWT token) |
| 4 | `GET /api/projects/` (with token) | 200 OK, returns list |
| 5 | `POST /api/projects/` | 201 Created |
| 6 | `GET /api/projects/<id>/` | 200 OK |
| 7 | `PATCH /api/projects/<id>/` | 200 OK |
| 8 | `POST /api/projects/<id>/file/` | 201 Created |
| 9 | Second user access same project | 403 or 404 (no access) |

---

## 📊 QA Metrics

| Metric | Description | Result |
|---------|--------------|--------|
| Automated Tests | `pytest` suite | ✅ 5 passed / 1 skipped |
| Integration Test | `run_e2e.sh` | ✅ Success |
| Auth Coverage | register, login, refresh | ✅ |
| CRUD Coverage | projects, files | ✅ |
| Permissions | user isolation | ✅ |
| Sharing (future) | collaboration | ⏭️ skipped |
| CI Status | GitHub Actions | 🟢 passing |

## 🔁 Agile & Sprint Summary

- **Sprint Duration:** 2 weeks  
- **Planning:** via Taiga (MoSCoW prioritization)  
- **Meetings:** daily async stand-ups  
- **QA:** integrated per sprint (tests before merge)  
- **Reviews:** peer-reviewed PRs before merge to `tests` branch  

### 🧭 Retrospective Highlights

- ✅ Clear task breakdown and working CI pipeline  
- ⚠️ Challenge: defining collaboration endpoints early  
- 🔄 Action: finalize graph-sharing logic in next stage  

---

## 🧑‍🔬 Contributors

| Name | Role |
|------|------|
| Pierre Lionnel Obiang | Backend Developer |
| Ryota Higa | Frontend / Integration |
| Jérôme Tran | QA & Automation, Documentation |

---

## 🏁 Conclusion

This MVP fulfills all **Stage 4 requirements**:

✅ Functional backend  
✅ Version-controlled development  
✅ Sprint planning and QA cycles  
✅ Automated end-to-end validation  
✅ Deliverables documented for manual review  

**Next Steps:**
- Implement project sharing/collaboration  
- Integrate frontend visualization components  
- Deploy production version (Render/Heroku)

---

© 2025 **Code Graph Explorer** — Holberton Portfolio Project

