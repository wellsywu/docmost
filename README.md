<div align="center">
    <h1><b>Docmost</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        <a href="https://docmost.com"><strong>Website</strong></a> | 
        <a href="https://docmost.com/docs"><strong>Documentation</strong></a> |
        <a href="https://twitter.com/DocmostHQ"><strong>Twitter / X</strong></a>
    </p>
</div>
<br />

## Getting started

To get started with Docmost, please refer to our [documentation](https://docmost.com/docs) or try our [cloud version](https://docmost.com/pricing) .

## Local Development

Run Docmost locally for development and testing.

**Prerequisites**

- Node.js 20+ and [pnpm](https://pnpm.io) `10.4.0` (run `corepack enable` to pin it)
- A running **PostgreSQL** and **Redis** instance

**Steps**

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create your environment file and fill in the required values:

   ```bash
   cp .env.example .env
   ```

   At minimum set `APP_SECRET` (generate one with `openssl rand -hex 32`), `DATABASE_URL`, and `REDIS_URL`.

3. Start PostgreSQL and Redis if you don't already have them (Docker example):

   ```bash
   docker run -d --name docmost-postgres -e POSTGRES_DB=docmost -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:16
   docker run -d --name docmost-redis -p 6379:6379 redis:7
   ```

4. Run the database migrations:

   ```bash
   pnpm --filter ./apps/server run migration:latest
   ```

5. Start the frontend and backend together:

   ```bash
   pnpm dev
   ```

   For real-time collaboration, run the collaboration process in a separate terminal:

   ```bash
   pnpm collab:dev
   ```

6. Open **http://localhost:5173** in your browser. The Vite dev server proxies API and WebSocket requests to the backend on `http://localhost:3000`.

> Before committing changes, run `pnpm --filter ./apps/server run lint` and the test suite (`pnpm --filter ./apps/server run test`).

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)

### Screenshots

<p align="center">
<img alt="home" src="https://docmost.com/screenshots/home.png" width="70%">
<img alt="editor" src="https://docmost.com/screenshots/editor.png" width="70%">
</p>

### License
Docmost core is licensed under the open-source AGPL 3.0 license.  
Enterprise features are available under an enterprise license (Enterprise Edition).  

All files in the following directories are licensed under the Docmost Enterprise license defined in `packages/ee/License`.
  - apps/server/src/ee
  - apps/client/src/ee
  - packages/ee

### Contributing

See the [development documentation](https://docmost.com/docs/self-hosting/development)

## Thanks
Special thanks to;

<img width="100" alt="Crowdin" src="https://github.com/user-attachments/assets/a6c3d352-e41b-448d-b6cd-3fbca3109f07" />

[Crowdin](https://crowdin.com/) for providing access to their localization platform.


<img width="48" alt="Algolia-mark-square-white" src="https://github.com/user-attachments/assets/6ccad04a-9589-4965-b6a1-d5cb1f4f9e94" />

[Algolia](https://www.algolia.com/) for providing full-text search to the docs.

