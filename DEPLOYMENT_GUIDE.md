# CRAM.ai Deployment Guide

Complete guide for deploying CRAM.ai (Retrieval-Augmented Generation academic assistant) to production. Works for any deployment platform—Railway, Vercel, Render, AWS, or self-hosted servers.

**Target Audience**: Developers, DevOps engineers, or anyone deploying CRAM.ai

**Estimated Time**: 30-45 minutes (end-to-end)

## What is CRAM.ai?

CRAM.ai is an AI-powered academic assistant that:
- Ingests PDF study materials and stores them by subject/resource type
- Uses semantic chunking and vector embeddings for intelligent retrieval
- Generates AI answers via LLM (Google Gemini) with source citations
- Provides a chat-based interface with real-time updates

**Use case**: Students upload notes/past papers → CRAM.ai answers subject-specific questions with sources

**Architecture**:
- Backend: FastAPI + ChromaDB + SQLite
- Frontend: React + Vite
- LLM: Google Gemini 2.5 Flash
- Embeddings: Sentence Transformers (all-MiniLM-L6-v2)


---

## Option 1: Vercel (Frontend) + Railway (Backend) — Recommended

### Frontend Deployment (Vercel)

1. **Prerequisites**
   - GitHub account with CRAM.ai repository cloned/forked
   - Vercel account (sign up at https://vercel.com)

2. **Deploy on Vercel**
   - Visit https://vercel.com → New Project
   - Import repository (select `cramai` or your fork)
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Root directory: `frontend`
   - Add environment variable:
     ```
     VITE_API_URL=<BACKEND_URL>  # Set after backend is deployed
     ```
   - Click Deploy → Get live URL (e.g., `https://cramai.vercel.app`)

3. **Update Code (frontend/src/App.jsx)**
   ```javascript
   const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
   ```

### Backend Deployment (Railway)

1. **Prerequisites**
   - Railway account (sign up at https://railway.app)
   - GitHub repository connected

2. **Deploy on Railway**
   - Visit https://railway.app → New Project
   - Select "Deploy from GitHub repo"
   - Choose your CRAM.ai repository
   - Railway auto-detects Python
   - Configure environment variables:
     ```
     GOOGLE_API_KEY=<YOUR_GOOGLE_GEMINI_API_KEY>
     PORT=8000
     HOST=0.0.0.0
     ```
   - Wait for build to complete → Copy public URL (e.g., `https://cramai-prod.railway.app`)

3. **Update Frontend**
   - Go back to Vercel project settings
   - Update environment variable:
     ```
     VITE_API_URL=https://cramai-prod.railway.app
     ```
   - Trigger redeploy

4. **Add Procfile** (required for Railway)
   Create `CRAM ai/Procfile`:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

### Database Persistence

By default, ChromaDB and SQLite store data locally. On container restarts, data is lost.

**Option A: Use Railway PostgreSQL Plugin** (Recommended)
```bash
# In Railway Dashboard: Add PostgreSQL plugin
# Then update backend to use PostgreSQL
```

**Option B: Attach Persistent Volume**
- In Railway: Add volume at `/app/data`
- Update `CRAM ai/main.py`:
```python
import os
chroma_path = os.getenv("CHROMA_PATH", "/app/data/chroma_store")
chroma_client = chromadb.PersistentClient(path=chroma_path)
```

---

## Option 2: Render (Alternative for Backend)

Render is an easy alternative to Railway for backend deployment.

### Backend Deployment

1. **Create Account**
   - Sign up at https://render.com
   - Connect GitHub account

2. **Create Web Service**
   - New Web Service → Select CRAM.ai repository
   - Configuration:
     ```
     Build command: pip install -r CRAM\ ai/requirements.txt
     Start command: cd CRAM\ ai && uvicorn main:app --host 0.0.0.0 --port $PORT
     Environment: Python 3.9+
     ```
   - Add environment variables:
     ```
     GOOGLE_API_KEY=<YOUR_API_KEY>
     PORT=8000
     ```
   - Select plan (Free tier available; spins down after 15 min inactivity)

3. **Get Backend URL**
   - Render provides public URL (e.g., `https://cramai-backend.onrender.com`)
   - Use this in frontend `VITE_API_URL`

---

## Step-by-Step Quick Start (Railway + Vercel)

### Phase 1: Prepare Repository

1. **Clone the repository**
   ```bash
   git clone https://github.com/visualxswaroop/cramai.git
   cd CRAM-ai
   ```

2. **Create Procfile** (required for Railway)
   ```bash
   echo "web: uvicorn main:app --host 0.0.0.0 --port \$PORT" > "CRAM ai/Procfile"
   git add "CRAM ai/Procfile"
   git commit -m "Add Procfile for Railway deployment"
   git push
   ```

3. **Verify requirements.txt** in `CRAM ai/`:
   ```
   fastapi==0.135.2
   uvicorn==0.42.0
   python-multipart==0.0.6
   google-generativeai==0.7.2
   chromadb==0.4.24
   sentence-transformers==2.7.0
   PyMuPDF==1.27.2.3
   python-dotenv==1.0.0
   ```

### Phase 2: Deploy Backend to Railway

1. **Sign up**: https://railway.app
2. **New Project**: Select "Deploy from GitHub"
3. **Connect repository**: Choose your forked CRAM.ai repo
4. **Wait for auto-detect**: Railway recognizes Python automatically
5. **Configure variables**:
   - `GOOGLE_API_KEY`: Your Google Gemini API key (get from https://makersuite.google.com/app/apikey)
   - `PORT`: 8000
6. **Deploy**: Watch build logs; wait for "success"
7. **Copy public URL**: Railway provides `https://<project>-prod.railway.app`

### Phase 3: Deploy Frontend to Vercel

1. **Sign up**: https://vercel.com
2. **New Project**: Import your GitHub repo
3. **Configure**:
   - Framework: Vite
   - Root directory: `frontend`
   - Build: `npm run build`
   - Output: `dist`
4. **Set environment variable**:
   - `VITE_API_URL`: `https://<project>-prod.railway.app` (from Railway)
5. **Deploy**: Wait for completion
6. **Done**: Your app is live at `https://cramai-<random>.vercel.app`

---

## Environment Variables Reference

### Backend (CRAM ai/)

```env
GOOGLE_API_KEY=<YOUR_GOOGLE_GEMINI_API_KEY>        # Required: from makersuite.google.com
PORT=8000                                           # Optional: default is 8000
HOST=0.0.0.0                                       # Optional: for production
DATABASE_URL=sqlite:///chat_history.db             # Optional: custom DB path
CHROMA_STORE_PATH=/app/data/chroma                 # Optional: persistent storage
```

### Frontend (frontend/)

```env
VITE_API_URL=<BACKEND_URL>                         # Backend API endpoint (e.g., https://cramai-prod.railway.app)
```

---

## CORS Configuration

Backend `CRAM ai/main.py` uses CORS middleware to allow frontend requests. Update origins based on your deployment:

```python
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:5173",              # Local development
    "http://localhost:3000",              # Alternative dev port
    "https://<your-vercel-domain>",       # Production frontend (e.g., cramai.vercel.app)
    "https://<your-custom-domain>",       # Custom domain if applicable
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Note**: Replace `<your-vercel-domain>` with your actual Vercel deployment domain.

---

## Cost Breakdown

| Service | Tier | Cost | Notes |
|---------|------|------|-------|
| **Railway Backend** | Free | $0 | 5GB/month included; $5/GB after |
| **Railway Backend** | Paid | $5+ | Always-on, more resources |
| **Vercel Frontend** | Free | $0 | Unlimited deployments |
| **Google Gemini API** | Free | $0 | Rate limited; $0.075/1M input tokens |
| **Gemini API (paid)** | Paid | $1.50/1M tokens | Better rates, higher limits |
| **Total (free tier)** | - | $0 | Works for prototyping |
| **Total (production)** | - | $5-50/month | Depends on usage |

---

## Production Checklist

- [ ] GOOGLE_API_KEY set in backend environment
- [ ] VITE_API_URL set in frontend environment
- [ ] CORS origins updated in backend
- [ ] Procfile created in `CRAM ai/`
- [ ] `.env` file added to `.gitignore` (don't commit secrets)
- [ ] ChromaDB path configured for persistence
- [ ] Database backups planned
- [ ] Error logging configured
- [ ] Rate limiting implemented (optional)
- [ ] SSL/HTTPS enabled (automatic on Vercel/Railway)

---

## Troubleshooting

### Backend Deployment Fails

**Debug steps**:
1. Check platform build logs (Railway/Render dashboard)
2. Look for Python errors, missing dependencies, or API key issues
3. Verify `Procfile` exists and is correctly formatted

**Common issues**:
- Missing `Procfile` → Create: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`
- Python version mismatch → Ensure Python 3.9+
- Missing `GOOGLE_API_KEY` → Add via environment variables
- Port binding failure → Use `$PORT` environment variable (not hardcoded)

### Frontend Can't Reach Backend

**Debug**:
1. Open browser console (F12)
2. Run:
   ```javascript
   console.log('API URL:', import.meta.env.VITE_API_URL)
   fetch('https://<backend-url>/').then(r => r.json()).then(console.log)
   ```
3. Check network tab for CORS errors

**Common fixes**:
- `VITE_API_URL` environment variable not set
- Backend CORS not configured for frontend domain
- Backend not running or public URL incorrect

### Gemini API Returns 503

**This is expected behavior** during high demand:
- Gemini API occasionally experiences service unavailability
- Retry button in UI handles this gracefully
- Try again after a few minutes

**Workaround** (optional):
- Implement exponential backoff for retries
- Monitor API status at https://status.cloud.google.com

---

## Optional: CI/CD Pipeline

Automate redeployment on every push to main/master branch.

**GitHub Actions Example** (.github/workflows/deploy.yml):

```yaml
name: Auto Deploy

on:
  push:
    branches: [ master, main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        run: |
          npm i -g @railway/cli
          railway deploy --token ${{ secrets.RAILWAY_TOKEN }}
```

**Setup**:
1. Generate Railway API token in account settings
2. Add to GitHub Secrets: `RAILWAY_TOKEN`
3. Push to trigger auto-deploy

---

## Monitoring & Maintenance

After deployment, monitor:

1. **Error Tracking**: Set up Sentry or Rollbar for error notifications
2. **Uptime Monitoring**: Use UptimeRobot to check backend health
3. **Performance**: Monitor API response times (target: <2s)
4. **Storage**: Track ChromaDB and SQLite database size
5. **API Quota**: Monitor Google Gemini API usage (free tier limits)

---

## Final Checklist

- [ ] Backend deployed and accessible at `<backend-url>`
- [ ] Frontend deployed and accessible at `<frontend-url>`
- [ ] Upload a test PDF and verify ingestion works
- [ ] Ask a test question and verify answer generation
- [ ] Check console for errors (browser F12)
- [ ] Test on multiple devices (desktop, mobile)
- [ ] Share deployed URLs with team/users

**Expected time**: 45 minutes to full deployment

---

## Resources

- **Railway**: https://docs.railway.app
- **Vercel**: https://vercel.com/docs
- **FastAPI**: https://fastapi.tiangolo.com/deployment/
- **React**: https://react.dev/learn/deployment
- **ChromaDB**: https://docs.trychroma.com/
- **Google Gemini**: https://makersuite.google.com
