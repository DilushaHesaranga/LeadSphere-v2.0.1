# LeadSphere API

This directory contains the NestJS API used for privileged LeadSphere team and invitation operations. Production hosting uses one native NestJS Vercel Function; local development continues to use the Nest CLI.

## Local development

Copy `.env.example` to `.env`, provide the required values, and run:

```powershell
npm install
npm run start:dev
```

The API is available at `http://localhost:3000/api` and the lightweight health endpoint is `http://localhost:3000/api/health`.

## Checks

```powershell
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

## Vercel

Vercel recognizes `src/main.ts` as the NestJS entry point. `vercel.json` selects native NestJS framework handling; no custom Express adapter, catch-all API file, or legacy `builds` configuration is used.

Create a separate Vercel project for this directory and set its **Root Directory** to `backend`. Add the production variables described in [`../docs/VERCEL_BACKEND.md`](../docs/VERCEL_BACKEND.md), deploy, and use the resulting HTTPS origin as the frontend's `VITE_API_URL`.

Do not include `/api` in `VITE_API_URL`; the frontend API client adds that prefix itself.
