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
**App Layers (Django :left_right_arrow: Next.js/React)**
![App Layers – Django / Next.js / React](https://github.com/jerome244/code_graph_explorer/blob/main/portfolio/stage%205/code%20graph-Page-4.drawio.png?raw=true)
**Runtime & Networking (ASGI/Daphne, Proxies, Caddy, Cloudflare)**
![Runtime & Networking – ASGI, Proxies, Caddy, Cloudflare](https://github.com/jerome244/code_graph_explorer/blob/main/portfolio/stage%205/code%20graph-Page-3.drawio.png?raw=true)
---
## Scope vs Delivery :white_check_mark:
| Feature | Planned | Delivered | Notes |
|--------|:------:|:---------:|------|
| Interactive visual code graph | :white_check_mark: | :white_check_mark: | Core functionality delivered |
| Real-time collaboration | :white_check_mark: | :white_check_mark: | WebSocket sync working |
| Audio call support | :white_check_mark: | :white_check_mark: | WebRTC in collaborative page |
| Save & Load sessions | :white_check_mark: | :white_check_mark: | Persistence with DB |
| Authentication | :white_check_mark: | :white_check_mark: | Essential login completed |
| GitHub integration | :white_check_mark: | :x: | Roadmap feature |
| Notification system | :white_check_mark: | :x: | Planned backlog |
| Payment system | :white_check_mark: | :x: | Future enhancement |
:bar_chart: **MVP completion: ~80% of scoped features**
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
| API End-to-End Testing | Python test suite included in repo | :white_check_mark: Implementated |
| Live Sync Testing | Manual & Observational | :white_check_mark: Verified |
| UI/UX Testing | Internal testing | :white_check_mark: Prototype-level validation |
:pushpin: Issues found were mainly related to synchronization timing → solved through iterative debugging.
---
## Team Retrospective
### :white_check_mark: Strengths
- Excellent communication and shared project vision
- Fast technical decision making
- Effective Git workflow with PR reviews & CI automation
### :arrows_counterclockwise: What Could Improve
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
### :pushpin: Key Learning
> By iterating rapidly on prototypes and validating each feature as soon as it was functional, the team avoided major architectural mistakes and reduced rework. Frequent communication and daily synchronization allowed blockers to be identified early, ensuring that no single developer was stuck waiting on others. This approach limited bottlenecks, improved technical alignment, and contributed to steady delivery throughout the project.
---
## Future Improvements
- :link: GitHub project import
- :bell: Notification system for collaboration events
- :credit_card: Payment models for pro features
- :chart_with_upwards_trend: Support richer relationships including classes and external libraries
These features would help Code Graph Explorer scale toward a full commercial platform.
---
## Conclusion
The team successfully implemented a functional MVP demonstrating:
:white_check_mark: Full-stack real-time collaboration architecture
:white_check_mark: Audio-enabled teamwork innovation
:white_check_mark: Project planning & delivery capabilities
This project offered valuable experience in distributed systems, DevOps automation, and agile teamwork — forming a strong foundation for future enhancements.
---
## Team Members
- Pierre Lionnel Obiang
- Ryota Higa
- Jerome Tran