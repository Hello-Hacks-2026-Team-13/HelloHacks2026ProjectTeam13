# HelloHacks2026ProjectTeam13

A full-stack starter for a long-distance relationship helper, with an Express API and a React + TypeScript web app.

## Project idea

Help long-distance couples find things to do together, even when their schedules or time zones do not line up.

Possible features and integrations:

- Compare schedules to find times when both people are available; potentially integrate Google Calendar.
- Account for different time zones.
- Suggest activities by category, such as movies, games, and recipes. Potential data sources include TMDb, TheMealDB, and RAWG.
- Use schedules and preferences to suggest ideas when users do not know what to choose, potentially with an LLM.
- Offer asynchronous activities for times without overlap, such as sending a photo or responding to a prompt.

## What each part does

- **Node.js** runs the server-side JavaScript code.
- **Express** handles HTTP requests. The backend currently exposes `GET /api/hello` as a sample API route.
- **React** builds the browser interface from reusable components. The starter page requests data from the sample API.
- **TypeScript** adds types to the frontend JavaScript, helping catch mistakes while editing and building the app.
- **Vite** runs the frontend development server and bundles the frontend for production. During development it forwards `/api` requests to Express.
- **npm workspaces** manage the backend and frontend packages from this repository's root.

## Project layout

```text
backend/
  src/index.js       Express app and API routes
frontend/
  index.html         Browser page entry point
  src/               React components, TypeScript, and styles
  vite.config.ts     Vite setup and development API proxy
package.json         Shared scripts and npm workspace configuration
```

## Run locally

Install [Node.js](https://nodejs.org/) 20.19 or newer in the 20.x line, or 22.12 or newer, then from the project root run:

```sh
npm install
npm run dev
```

Open <http://localhost:5173> for the React app. The Express API runs at <http://localhost:3001>; for example, visit <http://localhost:3001/api/hello> to see its JSON response.

Useful commands:

```sh
npm run build   # Type-check and build the frontend into frontend/dist
npm start       # Start the Express API only
```

The development proxy is configured in `frontend/vite.config.ts`, so browser code can request `/api/hello` without hard-coding the backend address. In production, deploy the built frontend and API behind a host or reverse proxy that routes `/api` to the backend.
