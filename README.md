# CRAM.ai

CRAM.ai is an academic assistant built with a Retrieval-Augmented Generation (RAG) workflow. It helps students upload PDF study materials, index them as searchable semantic chunks, and ask subject-specific questions with AI-generated answers backed by source citations.

## Key Features

- Upload PDF materials and store them by subject and resource type
- Semantic chunking with embeddings for accurate retrieval
- Vector search using ChromaDB and Sentence Transformers
- AI answer generation via Google Gemini with source attribution
- Chat-based interface with copy-to-clipboard support
- Retry UI for temporary Gemini 503 errors
- Progress feedback during long PDF ingestion

## Repository Structure

- `CRAM ai/` — backend FastAPI application
- `frontend/` — React + Vite frontend UI
- `PROJECT_DOCUMENTATION.md` — detailed project overview and roadmap

## Quick Start

1. Start the backend:
   ```bash
   cd "CRAM ai"
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

2. Start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open `http://localhost:5173` in your browser.

## Notes

- The backend uses `chroma_store` for vector storage and `chat_history.db` for session persistence.
- The project is designed for local development and can be extended for production deployment.
