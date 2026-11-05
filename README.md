# TALENTBRIDGE — Talent Bridge Full-Stack Monorepo

> **TalentBridge** is the platform where talented quiet builders get opportunities. It bridges the gap between introverted skilled developers, competitive programmers, designers, and project leaders or recruiters looking for authentic proof of work.

---

## Project Overview

TalentBridge is architected as a modular full-stack monorepo with distinct, independent frontend and backend packages:

- **Frontend**: Vite + Vanilla JavaScript single-page application featuring an interactive dot-matrix hands canvas background simulation, live debounced search, native Web Speech API voice input, candidate discovery grid, and an invitation handshake modal with real-time toast notifications.
- **Backend**: Node.js + Express REST API server with CORS, dotenv configuration, an in-memory candidate store, multi-token search filtering, and invite state tracking.

---

## Project Structure

```text
talent-bridge/
├── backend/
│   ├── package.json        # Express dependencies and scripts
│   ├── server.js           # REST API endpoints & in-memory candidate store
│   ├── .env.example        # Environment variable template
│   └── .env                # Local environment configuration (PORT=5000)
└── frontend/
    ├── package.json        # Vite dev server and build scripts
    ├── vite.config.js      # Vite configuration with /api proxy to backend
    ├── index.html          # Hero section, canvas, search bar, discovery & modal
    └── src/
        ├── canvas.js       # Kindred dot-matrix hands canvas simulation
        ├── main.js         # Client controller, API client, Web Speech API & modal
        └── style.css       # Complete design system styles
```

---

## Quick Start (Run Independently)

### 1. Backend Server (Node.js + Express)
Runs on **http://localhost:5000**

```bash
cd backend
npm install
npm start       # runs production server via node server.js
# or
npm run dev     # runs development server with nodemon
```

#### REST Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/candidates` | Returns all candidate cards |
| `GET` | `/api/candidates?search=<query>` | Live search matching name, skills, and proof of work |
| `POST` | `/api/invitations` | Body: `{ candidateId, role, message }`. Marks `connected: true` and returns status |
| `GET` | `/api/health` | Health check endpoint |

---

### 2. Frontend Application (Vite + Vanilla JS)
Runs on **http://localhost:5173**

```bash
cd frontend
npm install
npm run dev
```

To build for production:
```bash
npm run build
npm run preview
```

---

## Key Features

- **Dot-Matrix Hands Simulation**: Exact Kindred interactive canvas shader simulation preserved as-is.
- **Hero & Centered Copy**: *"Bridging the Talent Gap."* — *"Connecting quiet builders to the teams and opportunities that need them."*
- **Real-Time Debounced Search**: Filters candidates on the fly across skills, role tags, and proof-of-work.
- **Native Speech-to-Text (`Web Speech API`)**: Built-in voice search using native `SpeechRecognition` (`en-US` with `en-IN` fallback) with pulsing visual feedback.
- **Below-the-Fold Discovery Grid**: Displays builder cards (Priyam, Ankan, Devina, Rohan, Sneha, Arjun) with LeetCode stats, deployed apps, and verified skills.
- **Invitation Handshake State Machine**:
  - Modal with candidate summary and default role assignment (`Backend C++ Developer`).
  - Submitting dispatches `POST /api/invitations`, sets `connected: true`, and updates button to `Invited ✓`.
  - Emits floating success toast notification: *"Invitation sent to [Candidate Name]! Successfully linked to developer group."*
- **Zero External UI Dependencies**: Clean, minimalist UI built with high-performance CSS and native DOM APIs.
