# CRAM.ai Deployment Guide

This guide covers deploying both the FastAPI backend and React frontend to production environments.

## Deployment Architecture Overview

```
┌─────────────────────┐
│   Frontend (React)  │ → Netlify / Vercel / GitHub Pages
│   Static Build      │
└─────────────────────┘
         ↓ (HTTPS API calls)
┌─────────────────────┐
│  Backend (FastAPI)  │ → Railway / Render / Heroku / AWS
│  + ChromaDB         │
│  + SQLite           │
└─────────────────────┘
```

---

## Option 1: Vercel (Recommended - Easiest)

### Frontend Deployment

1. **Push to GitHub** (already done ✅)
   ```bash
   git remote -v  # Verify: https://github.com/visualxswaroop/cramai.git
   ```

2. **Deploy Frontend on Vercel**
   - Go to https://vercel.com
   - Click "Add New Project"
   - Import repository: `visualxswaroop/cramai`
   - Framework: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variables: `VITE_API_URL=https://your-backend-url`
   - Click Deploy

3. **Update Frontend API URL** (frontend/src/App.jsx)
   ```javascript
   const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
   ```

### Backend Deployment (use Railway or Render)

---

## Option 2: Railway (Recommended - Best for Python)

### Backend Deployment

1. **Create Railway Account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Deploy Backend**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `visualxswaroop/cramai`
   - Railway auto-detects Python

3. **Configure Environment Variables**
   - Add `GOOGLE_API_KEY=your_gemini_api_key`
   - Add `DATABASE_URL=sqlite:///chat_history.db` (default)
   - Add `PORT=8000`

4. **Setup Start Command**
   In `CRAM ai/Procfile`:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

5. **Get Backend URL**
   - Railway provides a public URL like: `https://cramai-production.railway.app`

### Frontend Update (Vercel)

After backend is deployed on Railway:
1. Go to Vercel project settings
2. Add environment variable:
   ```
   VITE_API_URL=https://cramai-production.railway.app
   ```
3. Redeploy

### Database Persistence

ChromaDB and SQLite will work locally on Railway, but data is lost on container restart. For production:

**Option A: Use Railway Postgres** (Better)
```bash
# Add PostgreSQL plugin in Railway
# Update backend to use PostgreSQL instead of SQLite
```

**Option B: Attach Persistent Volume**
- In Railway, add a volume mount at `/app/data`
- Modify `CRAM ai/main.py`:
```python
chroma_client = chromadb.PersistentClient(path="/app/data/chroma_store")
```

---

## Option 3: Render.com (Alternative)

### Backend Deployment

1. Go to https://render.com
2. Click "New Web Service"
3. Connect GitHub repo
4. Configuration:
   - **Build command**: `pip install -r CRAM\ ai/requirements.txt`
   - **Start command**: `cd CRAM\ ai && uvicorn main:app --host 0.0.0.0`
   - **Instance type**: Free tier available
   - **Environment variables**: Add `GOOGLE_API_KEY`

### Cost

- **Free tier**: Spins down after 15 min inactivity (cold starts ~30 sec)
- **Paid**: $7/month for always-on

---

## Step-by-Step: Quick Railway Deployment

### 1. Backend Setup

In `CRAM ai/Procfile`:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

In `CRAM ai/requirements.txt`, ensure latest versions:
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

### 2. Deploy Backend to Railway

```bash
cd CRAM-ai
git add .
git commit -m "Add deployment config"
git push origin master
```

Then in Railway dashboard:
- New Project → Deploy from GitHub → Select repo
- Wait for build and deployment
- Copy public URL

### 3. Update Frontend Environment

Create `frontend/.env.production`:
```
VITE_API_URL=https://your-railway-backend-url
```

Or in `frontend/vite.config.js`:
```javascript
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'https://your-railway-backend-url')
  }
})
```

### 4. Deploy Frontend to Vercel

```bash
# In Vercel Dashboard
# Settings → Environment Variables
VITE_API_URL=https://your-railway-backend-url

# Redeploy
```

---

## Environment Variables Reference

### Backend (CRAM ai/)

```env
GOOGLE_API_KEY=AIza...                    # Required: Gemini API key
PORT=8000                                 # Optional: defaults to 8000
HOST=0.0.0.0                             # Optional: for production
DATABASE_URL=sqlite:///chat_history.db   # Optional: custom DB path
CHROMA_STORE_PATH=/app/data/chroma       # Optional: for persistence
```

### Frontend (frontend/)

```env
VITE_API_URL=https://your-backend-url   # Backend API endpoint
```

---

## CORS Configuration

Backend `CRAM ai/main.py` should have CORS enabled for frontend domain:

```python
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://your-vercel-frontend.vercel.app",  # Add your Vercel URL
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

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

### Backend deployment fails

**Check logs**:
```bash
# Railway: View logs in dashboard
# Render: Tail logs in service page
# Look for: Python dependency errors, API key issues
```

**Common issues**:
- Missing `Procfile`
- Python version mismatch (3.9+)
- Missing `GOOGLE_API_KEY`
- Port binding to 8000 (use `$PORT` env var)

### Frontend can't reach backend

**Debug**:
```javascript
// In browser console (frontend/src/App.jsx)
console.log('API URL:', import.meta.env.VITE_API_URL)

// Test backend connectivity
fetch('https://your-backend-url/').then(r => r.json()).then(console.log)
```

**Fix**:
- Ensure `VITE_API_URL` is set correctly
- Check CORS headers in backend response
- Verify backend is running and accessible

### Gemini API 503 errors

- Expected during high demand
- Retry button handles gracefully
- Consider adding exponential backoff (future enhancement)

---

## Advanced: CI/CD Pipeline

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [ master ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Railway
        run: |
          npm i -g @railway/cli
          railway deploy --token ${{ secrets.RAILWAY_TOKEN }}
```

---

## Post-Deployment Monitoring

1. **Error Tracking**: Set up Sentry or Rollbar
2. **Uptime Monitoring**: Use UptimeRobot
3. **Performance**: Monitor response times
4. **Database**: Monitor ChromaDB and SQLite size
5. **API Rate Limits**: Track Gemini API usage

---

## Next Steps

1. **Choose deployment platform** (Railway recommended)
2. **Create accounts** (Railway + Vercel)
3. **Add environment variables**
4. **Deploy backend first** (get URL)
5. **Deploy frontend** (pass backend URL)
6. **Test end-to-end** (upload PDF, ask question)
7. **Monitor in production**

**Estimated setup time**: 30-45 minutes

---

## Support & Resources

- Railway docs: https://docs.railway.app
- Vercel docs: https://vercel.com/docs
- FastAPI deployment: https://fastapi.tiangolo.com/deployment/
- React deployment: https://react.dev/learn/deployment
