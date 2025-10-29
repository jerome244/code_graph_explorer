# Final Report – Stage 5: Project Closure

## Project Name: Code Graph Explorer

---

## Project Overview

Code Graph Explorer is a collaborative web application designed to help developers visualize and explore a project’s internal code structure.  
The platform enables onboarding, debugging, and team communication by providing a visual representation of file and function relationships.

Users can:
- Analyze graph-based views of code structure
- Collaborate live on the same workspace
- Communicate through built-in audio calls
- Save and reload project states
- Share workspaces with their team

---

## Technical Overview

| Category | Technology |
|---------|------------|
| Frontend | React / Next.js |
| Backend | Django (Python) |
| Real-time Features | WebSockets |
| Audio Calls | WebRTC |
| Database | PostgreSQL |
| Deployment | Docker + Reverse Proxy (Caddy) |
| CI Automation | GitHub Actions |
| Project Management | Taiga |

### System Architecture

Below are the final architecture diagrams used in the MVP.

**App Layers (Django ↔ Next.js/React)**
![App Layers – Django / Next.js / React](sandbox:/mnt/data/code%20graph-Page-4.drawio.png)

**Runtime & Networking (ASGI/Daphne, Proxies, Caddy/Cloudflare)**
![Runtime & Networking – ASGI, Proxies, Caddy, Cloudflare](sandbox:/mnt/data/code%20graph-Page-3.drawio.png)

---

## Scope vs Delivery ✅

| Feature | Planned | Delivered | Notes |
|--------|:------:|:---------:|------|
| Interactive visual code graph | ✅ | ✅ | Core functionality delivered |
| Real-time collaboration | ✅ | ✅ | WebSocket sync working |
| Audio call support | ✅ | ✅ | WebRTC in collaborative page |
| Save & Load sessions | ✅ | ✅ | Persistence with DB |
| Authentication | ✅ | ✅ | Essential login completed |
| GitHub integration | ✅ | ❌ | Roadmap feature |
| Notification system | ✅ | ❌ | Planned backlog |
| Payment system | ✅ | ❌ | Future enhancement |

📊 **MVP completion: ~80% of scoped features**

---

## Results Summary

- Stable real-time collaboration enabling multiple users to work simultaneously  
- Audio communication directly inside the coding workspace  
- Graph visualization successfully renders functions and file relationships  
- Docker packaging + reverse proxies allow portable deployment  
- Automated E2E testing confirms core functionality reliability  

---

## QA Strategy & Testing Results

| Test Type | Tools | Status |
|----------|------|--------|
| API End-to-End Testing | Python test suite included in repo | ✅ Implemented |
| Live Sync Testing | Manual & Observational | ✅ Verified |
| UI/UX Testing | Internal testing | ✅ Prototype-level validation |

📌 Issues found were mainly related to synchronization timing → solved through iterative debugging.

---

## Team Retrospective

### ✅ Strengths
- Excellent communication and shared project vision  
- Fast technical decision making  
- Effective Git workflow with PR reviews & CI automation  

### 🔄 What Could Improve
- More structured task breakdown  
- Earlier integration testing  
- Reserve time for UI polish  

---

## Challenges & Solutions

| Challenge | Resolution |
|----------|------------|
| WebSocket conflict and synchronization issues | Pair debugging + incremental improvements |
| Graph rendering complexity | Iterative prototypes + simplified MVP focus |
| Managing multiple live collaboration features at once | Prioritization + stable CI pipeline |

📌 **Lesson Learned:**  
> Iterative prototyping and communication prevented bottlenecks.

---

## Future Improvements

- 🔗 GitHub project import  
- 🔔 Notification system for collaboration events  
- 💳 Payment models for pro features  
- 📈 Support richer relationships including classes and external libraries  

These features would help Code Graph Explorer scale toward a full commercial platform.

---

## Conclusion

The team successfully implemented a functional MVP demonstrating:  
✅ Full-stack real-time collaboration architecture  
✅ Audio-enabled teamwork innovation  
✅ Project planning & delivery capabilities  

This project offered valuable experience in distributed systems, DevOps automation, and agile teamwork — forming a strong foundation for future enhancements.

---

## Team Members

- Pierre Lionnel Obiang  
- Ryota Higa  
- Jerome Tran  

**End of Final Report** ✅
