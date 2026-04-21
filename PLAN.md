# [Stage 11] Production Deployment Preparation

## Objective
Prepare the codebase for production deployment. Since the AI agent (Claude Code) cannot click buttons on Vercel or Render to authenticate and deploy, your job is to configure the codebase perfectly so the user can easily deploy it using GitHub.

## Atomic Tasks

### Task 1: Git Initialization
1. Run `git init`.
2. Ensure there is a `.gitignore` file at the root. It MUST include:
   ```
   node_modules
   dist
   .env
   .claude
   ```
3. Run `git add .` and `git commit -m "feat: prepare for production deployment"`.

### Task 2: Backend (Render) Deployment Config
1. Create a `render.yaml` file in the root directory for deploying the bot as a Web Service on Render:
   ```yaml
   services:
     - type: web
       name: telegram-trading-bot
       env: node
       buildCommand: npm ci && npm run build -w bot
       startCommand: npm run start:bot
       envVars:
         - key: NODE_ENV
           value: production
         - key: PORT
           value: 10000
   ```
2. Verify `package.json` in `bot` has a `start` script: `"start": "node dist/index.js"`, and the root `package.json` has `"start:bot": "npm run start -w bot"`.

### Task 3: Frontend (Vercel) Deployment Config
1. Create a `vercel.json` in the root directory:
   ```json
   {
     "buildCommand": "npm run build -w web",
     "outputDirectory": "web/dist",
     "framework": "vite"
   }
   ```
2. Ensure the Telegram Bot API uses `https://your-vercel-domain.vercel.app` correctly in the future.

### Task 4: Deployment Guide for User
1. Create a file named `DEPLOYMENT_GUIDE_KO.md`.
2. Write step-by-step instructions for the CEO:
   - Step 1: Create a GitHub account and push this repository.
   - Step 2: Go to Vercel (vercel.com), import the GitHub repo, and deploy the Frontend.
   - Step 3: Go to Render (render.com), import the GitHub repo, and deploy the Backend (Bot). Make sure to copy the `.env` variables into Render's environment settings.
   - Step 4: Update Telegram BotFather and `.env` with the new Vercel domain.

## Verification
- Ensure `render.yaml` and `vercel.json` are valid.
- Run `git status` to ensure everything is tracked except `.env` and `node_modules`.
