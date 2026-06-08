# CRAM.ai - Academic Assistant RAG Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [RAG Pipeline Detailed Flow](#rag-pipeline-detailed-flow)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Backend API Endpoints](#backend-api-endpoints)
7. [Frontend Components & Features](#frontend-components--features)
8. [Data Flow Diagrams](#data-flow-diagrams)
9. [Development Roadmap](#development-roadmap)
10. [Deployment & Testing](#deployment--testing)

---

## Project Overview

**CRAM.ai** is a full-stack Retrieval Augmented Generation (RAG) application designed specifically for academic students to efficiently search, organize, and ask questions about their study materials.

### Key Features
- **PDF Upload & Ingestion**: Upload study materials (notes, past year questions, important concepts, question banks) with automatic semantic chunking
- **Subject Organization**: Organize materials by subject with resource type categorization
- **Intelligent Search**: Retrieve relevant content using embeddings and vector similarity
- **AI-Powered Answers**: Generate contextual answers using Google Gemini API with cited sources
- **Chat History**: Maintain conversation history per session with persistent storage
- **Progress Feedback**: Visual indicators for long-running operations (2-3 minute PDF processing)
- **Error Handling**: Graceful degradation with retry mechanisms for API unavailability

### Problem Statement
Students often struggle with:
- Organizing large volumes of study materials
- Finding relevant content quickly across multiple documents
- Getting context-aware answers that cite specific sources
- Waiting indefinitely without feedback during processing

---

## Architecture Overview

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE (React)                    │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │  PDF Upload    │  │   Chat Interface │  │  Subject Focus  │ │
│  │   Component    │  │   with Markdown  │  │   Manager       │ │
│  └────────────────┘  └──────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↕ (HTTP/Axios)
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (FastAPI)                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┤
│  │  /ingest         │  │  /chat           │  │  /subjects       │
│  │  POST            │  │  POST            │  │  GET             │
│  │  PDF Processing  │  │  RAG Orchestration   │  │  Query Storage   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘
└─────────────────────────────────────────────────────────────────┘
         ↕                    ↕                        ↕
┌─────────────────────────────────────────────────────────────────┐
│                     DATA LAYER                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┤
│  │  ChromaDB        │  │  Sentence        │  │  SQLite DB       │
│  │  (Vector Store)  │  │  Transformers    │  │  (Chat History)  │
│  │  chroma.sqlite3  │  │  (Embeddings)    │  │  chat_history.db │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘
└─────────────────────────────────────────────────────────────────┘
         ↕                        ↕
┌──────────────────────────────────────────────────────────────────┐
│              EXTERNAL SERVICES                                    │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  Google Gemini 2.5  │  │  PyMuPDF (fitz)                  │  │
│  │  Flash LLM          │  │  PDF Text Extraction             │  │
│  │  (Answer Generation)│  │                                  │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Three Core Layers

| Layer | Responsibility | Technologies |
|-------|-----------------|--------------|
| **Presentation** | User interface, form handling, chat rendering | React 19.2.6, Vite 8.0.14, TailwindCSS 4.3.0 |
| **Application** | API endpoints, business logic, RAG orchestration | FastAPI 0.135.2, Uvicorn 0.42.0 |
| **Data** | Vector storage, embeddings, persistent history | ChromaDB, Sentence Transformers, SQLite |

---

## RAG Pipeline Detailed Flow

### Phase 1: Document Ingestion (`/ingest` endpoint)

```
INPUT: PDF File + Subject + Resource Type
  │
  ├─► [1] PDF EXTRACTION
  │   └─ Read bytes with PyMuPDF (fitz)
  │   └─ Extract text with page markers "[Page N]"
  │   └─ Error handling: Invalid PDF → detailed error message
  │
  ├─► [2] SEMANTIC CHUNKING (2-3 minutes for large PDFs)
  │   └─ Use LangChain's SemanticChunker
  │   └─ Recursively split by semantic similarity
  │   └─ Parameters: breakpoint_percentile=85
  │   └─ Filter: Keep chunks > 80 characters
  │
  ├─► [3] EMBEDDING GENERATION
  │   └─ Use Sentence Transformers model (all-MiniLM-L6-v2)
  │   └─ Convert each chunk to 384-dim vector
  │   └─ Batch process for efficiency
  │
  ├─► [4] VECTOR STORAGE
  │   └─ Store vectors in ChromaDB
  │   └─ Metadata per chunk:
  │      - subject: "ARTIFICIAL INTELLIGENCE"
  │      - resource_type: "notes" | "pyq" | "imp" | "questionbank"
  │      - page_number: extracted from "[Page N]"
  │      - chunk_id: unique identifier
  │
└─► OUTPUT: {"chunks_stored": 166, "subject": "ARTIFICIAL INTELLIGENCE"}
```

**Timeline for typical PDF:**
- Extract text: ~5-10 seconds
- Semantic chunking: ~2-3 minutes (depends on PDF size & content complexity)
- Embedding generation: ~20-40 seconds
- Database storage: ~5 seconds
- **Total: 2.5-4 minutes**

### Phase 2: Retrieval & Context Building (`/chat` endpoint)

```
INPUT: User Question + Subject + Marks + Resource Type
  │
  ├─► [1] QUERY EMBEDDING
  │   └─ Convert question to same 384-dim embedding space
  │   └─ Use identical Sentence Transformers model
  │
  ├─► [2] SEMANTIC SEARCH
  │   └─ Query ChromaDB for closest vectors
  │   └─ Filter by:
  │      - Subject match
  │      - Resource type (if specified)
  │   └─ Retrieve top K=4 most similar chunks
  │   └─ Similarity score used for ranking
  │
  ├─► [3] CONTEXT PREPARATION
  │   └─ Combine retrieved chunks into single context window
  │   └─ Include metadata (source, page, type)
  │   └─ Ensure context fits within Gemini token limits (~2M tokens)
  │   └─ Add session history for conversation continuity
  │
  ├─► [4] PROMPT CONSTRUCTION
  │   └─ System prompt: "You are an academic assistant..."
  │   └─ Context section: Retrieved chunks
  │   └─ History section: Previous Q&A from session
  │   └─ User question: Actual query
  │   └─ Instructions: "Cite sources and provide detailed answers based on marks level"
  │
  ├─► [5] LLM GENERATION
  │   └─ Call Google Gemini 2.5 Flash API
  │   └─ Parameters:
  │      - temperature: 0.7 (balanced creativity)
  │      - max_output_tokens: depends on marks level
  │      - timeout: 30 seconds
  │   └─ Error handling: Catch 503 errors (API unavailable)
  │      - Frontend retry: User can manually click "Retry" button
  │      - Auto-retry: (Optional future enhancement)
  │
  ├─► [6] RESPONSE POST-PROCESSING
  │   └─ Extract answer text
  │   └─ Extract source citations from context
  │   └─ Build metadata for each source:
  │      { source: "filename", subject: "AI", resource_type: "notes", page: 5 }
  │
  ├─► [7] PERSISTENCE
  │   └─ Save Q&A pair to SQLite chat_history.db
  │   └─ Fields: session_id, question, answer, sources, timestamp, subject
  │   └─ Store once per session per unique question
  │
└─► OUTPUT: {
      "answer": "Detailed markdown answer with **bold** and code blocks",
      "sources": [
        {"source": "AI_Notes.pdf", "subject": "ARTIFICIAL INTELLIGENCE", "resource_type": "notes", "page": 3},
        ...
      ]
    }
```

### Phase 3: Quality Layers

#### Embedding Quality
- **Model**: `all-MiniLM-L6-v2` (Sentence Transformers)
- **Dimensions**: 384-dimensional vectors
- **Training**: Trained on 215M sentence pairs
- **Strength**: Fast + accurate for semantic similarity
- **Why this model**: Excellent balance of speed and quality for academic content

#### Semantic Chunking Strategy
- **Traditional approach**: Fixed-size windows → loses semantic boundaries
- **Our approach**: Semantic breakpoints using LangChain
- **Breakpoint selection**: 85th percentile of distances
- **Benefit**: Chunks respect topic boundaries naturally
- **Result**: Better retrieval accuracy and context coherence

#### Retrieval Ranking
- Cosine similarity between question and chunk embeddings
- Metadata filtering for subject/resource type precision
- Top-4 chunks selected for context window
- Ranked by relevance score

---

## Technology Stack

### Frontend
```
Framework       React 19.2.6        Component-based UI library
Build Tool      Vite 8.0.14         Lightning-fast dev server
Styling         TailwindCSS 4.3.0   Utility-first CSS
HTTP Client     Axios               Promise-based HTTP requests
Markdown        react-markdown      Render AI responses with formatting
State Mgmt      React Hooks         useState, useRef, useEffect
```

### Backend
```
Framework       FastAPI 0.135.2     Modern Python async web framework
Server          Uvicorn 0.42.0      ASGI production-ready server
PDF Processing  PyMuPDF 1.27.2.3    Fast PDF text extraction
LLM Integration google-generativeai  Google Gemini API client
Embeddings      sentence-transformers semantic vector generation
Vector DB       chromadb            Persistent vector storage
Chunking        langchain-text-splitters semantic text splitting
Utilities       python-dotenv       Environment variable management
```

### Data Storage
```
Vector Store    ChromaDB             Embedded vector database
File Format     SQLite3              Persistent collections in chroma_store/
Chat History    SQLite3              Conversation persistence
```

### Deployment
```
Development     localhost:5173       Frontend (Vite)
                localhost:8000       Backend (Uvicorn)
Network Access  192.168.29.209:5173  Frontend (LAN accessible)
```

---

## Project Structure

```
RAG/
├── academic-assistant/          # Backend application
│   ├── main.py                  # FastAPI application + endpoints
│   ├── rag_chain.py             # RAG pipeline orchestration
│   ├── ingest.py                # Document ingestion script
│   ├── retrieve.py              # Vector retrieval logic
│   ├── list_models.py           # Available Gemini models
│   ├── requirements.txt          # Python dependencies
│   ├── .env                     # API keys (gitignored)
│   └── chroma_store/            # Vector database directory
│       ├── chroma.sqlite3       # Main database file
│       └── [collection-id]/     # Embeddings storage
│
├── frontend/                    # React application
│   ├── src/
│   │   ├── App.jsx              # Main React component (~1700 lines)
│   │   │   ├── State Management (useState hooks)
│   │   │   ├── Handlers (upload, send, retry, etc.)
│   │   │   ├── Styles (inline <style> tag with all CSS)
│   │   │   └── JSX (sidebar, upload zone, chat)
│   │   ├── main.jsx             # React entry point
│   │   ├── index.css            # Global styles (minimal)
│   │   └── assets/              # Static resources
│   ├── public/
│   │   └── favicon.svg          # Prism logo favicon
│   ├── index.html               # HTML template
│   ├── package.json             # NPM dependencies
│   ├── vite.config.js           # Vite configuration
│   └── eslint.config.js         # Linting rules
│
└── PROJECT_DOCUMENTATION.md     # This file
```

### Key File Responsibilities

**academic-assistant/main.py**
- FastAPI app initialization with CORS enabled
- `@app.post("/ingest")`: Handles PDF upload → extraction → chunking → storage
- `@app.post("/chat")`: Orchestrates RAG pipeline → answer generation
- `@app.get("/subjects")`: Returns list of indexed subjects
- Error handling with HTTPException and detailed error messages

**academic-assistant/rag_chain.py**
- `chunk_text_semantic()`: Semantic text splitting using LangChain
- `embed_text()`: Convert text to embeddings using Sentence Transformers
- `retrieve_context()`: Query ChromaDB and build context window

**frontend/src/App.jsx**
- **State variables**: subject, messages, loading, uploading, uploadProgress, etc.
- **Handlers**: 
  - `handleUpload()`: PDF file upload with progress animation
  - `handleSend()`: Send query to backend + display response
  - `handleRetry()`: Retry failed requests (503 errors)
  - `copyToClipboard()`: Copy button for responses
- **Styles**: 240+ lines of CSS for dark theme, animations, responsive layout
- **JSX**: Sidebar (subjects/resources), upload zone, chat area, input deck

---

## Backend API Endpoints

### 1. POST `/ingest`
**Purpose**: Upload and process a PDF document

**Request Body**:
```json
{
  "file": <binary PDF data>,
  "subject": "ARTIFICIAL INTELLIGENCE",
  "resource_type": "notes"
}
```

**Response** (200 OK):
```json
{
  "chunks_stored": 166,
  "subject": "ARTIFICIAL INTELLIGENCE"
}
```

**Error Response** (400/500):
```json
{
  "detail": "PDF must have selectable text. Try OCR if needed."
}
```

**Processing Flow**:
1. Validate file is PDF (case-insensitive `.pdf` extension)
2. Extract text with PyMuPDF
3. Perform semantic chunking
4. Generate embeddings
5. Store in ChromaDB with metadata
6. Return chunk count

**Time Complexity**: O(n*m) where n=pages, m=avg tokens per page
**Space Complexity**: Vectors stored persistently in ChromaDB

---

### 2. POST `/chat`
**Purpose**: Submit question and get AI-generated answer with sources

**Request Body**:
```json
{
  "question": "What is buffer management?",
  "subject": "ARTIFICIAL INTELLIGENCE",
  "marks": 5,
  "resource_type": "notes",
  "session_id": "session-1717859342456"
}
```

**Response** (200 OK):
```json
{
  "answer": "# Buffer Management\n\nBuffer management is a critical component...\n## Sources\n- Page 45: AI_Notes.pdf",
  "sources": [
    {
      "source": "AI_Notes.pdf",
      "subject": "ARTIFICIAL INTELLIGENCE",
      "resource_type": "notes",
      "page": 45
    }
  ]
}
```

**Error Response** (503 Service Unavailable):
```json
{
  "detail": "This model is currently experiencing high demand..."
}
```

**Processing Flow**:
1. Generate embedding for question
2. Retrieve top-4 similar chunks from ChromaDB
3. Build RAG context with metadata
4. Construct prompt with system instructions
5. Call Gemini API
6. Save to chat history (SQLite)
7. Return answer + sources

**Error Handling**:
- Gemini API 503 → Frontend shows retry button
- Network timeout → Graceful error message
- Invalid subject → Search across all subjects

---

### 3. GET `/subjects`
**Purpose**: Get list of all indexed subjects

**Response** (200 OK):
```json
{
  "subjects": [
    "ARTIFICIAL INTELLIGENCE",
    "DATABASE MANAGEMENT",
    "OPERATING SYSTEMS"
  ]
}
```

**Logic**:
- Queries ChromaDB metadata
- Extracts unique subject values
- Returns sorted list
- Caches in memory for performance

---

## Frontend Components & Features

### Main Component Architecture

```
App.jsx
├── State Management (22 state variables)
├── Effects (auto-scroll, textarea resize)
├── Event Handlers
│   ├── handleUpload() - PDF processing
│   ├── handleSend() - Query submission
│   ├── handleRetry() - Retry failed requests
│   ├── handleKeyDown() - Enter to send
│   └── copyToClipboard() - Copy response
├── Styling (240+ lines of CSS)
└── JSX Structure
    ├── Sidebar
    │   ├── Subject Focus section
    │   ├── Resource Type pills
    │   ├── Detail Tuning slider
    │   └── Upload zone
    ├── Chat Container
    │   ├── Empty state with prism logo
    │   ├── Message list (user + assistant)
    │   ├── Loading indicator
    │   └── Auto-scroll to latest
    └── Input Deck
        ├── Subject warning banner
        ├── Textarea with auto-resize
        ├── Send button
        └── Metadata footer
```

### State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `subject` | String | Currently selected study subject |
| `subjects` | Array | List of indexed subjects from backend |
| `messages` | Array | Chat conversation history |
| `question` | String | Current textarea input |
| `marks` | Number | Answer detail level (2/5/10) |
| `loading` | Boolean | Chat API call in progress |
| `uploading` | Boolean | PDF upload in progress |
| `uploadMsg` | String | Upload success/error message |
| `uploadOk` | Boolean | Upload succeeded flag |
| `uploadProgress` | Number | 0-100 progress percentage |
| `noSubjectWarning` | Boolean | Show "select subject" warning |
| `resourceType` | String | Filter docs by type (notes/pyq/imp) |
| `copiedIndex` | Number | Which message was copied (for UI feedback) |
| `retryParams` | Object | Stored params for retry on 503 error |
| `lastRetryableMessageIndex` | Number | Index of message with retry button |
| `activeFile` | String | Filename of currently processing PDF |

### Key Features

#### 1. PDF Upload with Progress Feedback
- Drag-and-drop or click to select
- Progress bar animates during 2-3 min processing
- Shows "Semantic chunking in progress..."
- Success/error messages with detailed feedback
- Prevents duplicate uploads while processing

#### 2. Subject-Based Organization
- Sidebar shows all indexed subjects
- Click to focus search on that subject
- Resource type filter (Notes/PYQ/IMP/Q-Bank)
- Auto-updates available subjects on ingest

#### 3. Detail Tuning Slider
- **Short (≤2 marks)**: Concise answers, minimal explanation
- **Medium (3-5 marks)**: Balanced detail with examples
- **Detailed (6-10 marks)**: Comprehensive with diagrams references

#### 4. Chat Interface with RAG
- Messages show as user bubbles (right) and assistant bubbles (left)
- Assistant avatar shows prism logo
- Markdown rendering for formatted responses
- Copy button for each response
- Sources cited at bottom of each answer

#### 5. Error Recovery
- Network errors show detailed messages
- 503 API errors show with "Retry" button
- Subject validation warning before send
- Auto-retry option for temporary failures

#### 6. Responsive Design
- Dark theme optimized for long study sessions
- Works on desktop and tablet
- Sidebar collapses on mobile (future)
- Auto-resizing textarea

### Styling Theme

```css
Colors:
  --bg-space: #030014           /* Deep dark background */
  --text-primary: #e5e5e5       /* Main text */
  --text-secondary: #a3a3a3     /* Secondary text */
  --text-muted: #6b6b6b         /* Muted text */
  --accent-purple: #a855f7      /* Primary accent */
  --accent-purple-dim: rgba(168,85,247,0.1)

Animations:
  Smooth transitions (0.3s cubic-bezier)
  Slide-in effects for messages
  Fade-in for loading states
  Hover effects on buttons

Typography:
  Font: Plus Jakarta Sans, Space Grotesk
  Sizes: 11px (micro) to 16px (headings)
  Line heights: 1.5-1.8 for readability
```

---

## Data Flow Diagrams

### Document Ingestion Flow

```
User clicks "Drop or Select PDF"
    ↓
File input onChange → handleUpload()
    ↓
Create FormData with file + subject + resource_type
    ↓
POST to /ingest endpoint
    ↓
setUploading(true), setUploadProgress(0)
    ↓
[During upload: setUploadProgress(0→95%) every 800ms]
    ↓
Response: chunks_stored = 166
    ↓
setUploadOk(true), setUploadMsg("166 chunks stored...")
    ↓
setTimeout(() => clear progress, 500ms)
    ↓
Subjects sidebar auto-updates
```

### Chat Query Flow

```
User types question + presses Enter/click Send
    ↓
Check: subject selected? → No → show warning, return
    ↓
Check: subject selected? → Yes → continue
    ↓
Add user message to chat: {role: "user", content: question}
    ↓
setLoading(true)
    ↓
POST to /chat with question + subject + marks + resource_type
    ↓
Store queryParams in retryParams state (for retry on 503)
    ↓
Response received:
    ├─ Success → Add assistant message with sources
    ├─ 503 Error → Add message with isRetryable=true flag
    └─ Other Error → Add error message
    ↓
setLoading(false)
    ↓
Auto-scroll to latest message
    ↓
Save in SQLite chat_history.db (backend)
```

### Retry on 503 Flow

```
Gemini returns 503 "Service Unavailable"
    ↓
handleSend() catches error, detects status 503
    ↓
setRetryParams(question, subject, marks, resource_type)
    ↓
Add message to chat with isRetryable=true
    ↓
UI renders "Retry" button below error message
    ↓
User clicks "Retry" button
    ↓
handleRetry() called
    ↓
Use stored retryParams, POST to /chat again
    ↓
Same flow as handleSend()
    ↓
Success → Replace error message with answer
    ↓
Failure → Another retry button shown
```

---

## Development Roadmap

### Completed Features ✅

| Feature | Status | Date | Notes |
|---------|--------|------|-------|
| PDF Upload & Ingestion | ✅ | Initial | Semantic chunking implemented |
| Subject Organization | ✅ | Initial | Multiple subjects indexed in ChromaDB |
| Vector Search | ✅ | Initial | Cosine similarity with top-4 retrieval |
| Gemini Integration | ✅ | Initial | Async API calls with error handling |
| Chat History | ✅ | Initial | SQLite persistence per session |
| Progress Bar | ✅ | Recent | Animated progress during upload |
| Subject Validation | ✅ | Recent | Warning banner when subject not selected |
| Retry Mechanism | ✅ | Recent | Manual retry button for 503 errors |
| Copy to Clipboard | ✅ | Earlier | Works with markdown content |
| Markdown Rendering | ✅ | Earlier | Formatted responses with code blocks |
| Dark Theme UI | ✅ | Initial | Optimized for readability |

### In-Progress Features 🔄

| Feature | Progress | Priority | Notes |
|---------|----------|----------|-------|
| Mobile Responsiveness | 30% | Medium | Sidebar needs collapse on mobile |
| Auto-Retry Logic | 0% | Medium | Exponential backoff for API retries |
| Multi-User Support | 0% | Low | Currently single-user per session |

### Planned Features 📋

| Feature | Complexity | Priority | Timeline |
|---------|-----------|----------|----------|
| **Conversation Search** | Medium | High | Search within chat history |
| **Export Conversations** | Low | Medium | PDF/DOCX export of chat |
| **User Authentication** | High | Medium | Login + saved conversations |
| **Voice Input** | Medium | Low | Speak questions instead of type |
| **Image Upload** | Medium | Low | Scan textbook pages via phone camera |
| **Offline Mode** | High | Low | LocalStorage for cached embeddings |
| **Advanced RAG** | High | Medium | Multi-hop retrieval, re-ranking |
| **Custom LLM** | High | Low | Self-hosted or alternative model |

### Technical Debt & Improvements

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Extract frontend CSS to separate file | Low | Low | Nice-to-have |
| Add TypeScript to backend | Medium | High | Improves maintainability |
| Implement caching layer | Medium | Medium | Improves response time |
| Add comprehensive logging | Low | Medium | Better debugging |
| Performance optimization | Medium | Medium | Semantic search tuning |
| Add end-to-end tests | High | High | Critical for reliability |

---

## Deployment & Testing

### Local Development Setup

```bash
# Backend Setup
cd academic-assistant
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
export GOOGLE_API_KEY=your_key_here
uvicorn main:app --reload

# Frontend Setup (in new terminal)
cd frontend
npm install
npm run dev
```

### Environment Variables (.env)

```
GOOGLE_API_KEY=AIza...  # Required for Gemini API
PORT=8000               # Backend port
FRONTEND_PORT=5173      # Vite dev server
```

### Testing Checklist

**Upload Flow**:
- [ ] Upload small PDF (< 1MB) - should complete in 30 sec
- [ ] Upload large PDF (> 10MB) - watch progress bar fill
- [ ] Upload non-PDF file - should show error
- [ ] Upload corrupted PDF - should show extraction error

**Chat Flow**:
- [ ] Send question without selecting subject - should show warning
- [ ] Send question with subject - should retrieve sources
- [ ] Verify sources are cited in response
- [ ] Copy response text - should work with clipboard API

**Error Handling**:
- [ ] Disconnect backend - frontend shows network error
- [ ] Simulate Gemini 503 - retry button appears
- [ ] Click retry - should resend same query
- [ ] Reload page - chat history preserved

**Performance**:
- [ ] Measure upload time for 100MB PDF
- [ ] Measure search latency (embedding + retrieval)
- [ ] Measure Gemini response time (typically 2-5 sec)

### Production Considerations

1. **Scaling ChromaDB**: Currently embedded; consider persistent deployment
2. **API Rate Limiting**: Add limits to prevent API quota exhaustion
3. **User Quotas**: Limit uploads/queries per user
4. **CDN**: Serve static assets from CDN
5. **Monitoring**: Add logging for all API calls and errors
6. **Backup**: Automatic backup of chroma_store directory
7. **Security**: Validate all inputs, use API key rotation

---

## Common Issues & Solutions

### Issue: PDF Upload Takes 3+ Minutes
**Cause**: Large semantic chunking operation
**Solution**: Show progress bar (✅ implemented), add cancel button (future)
**Workaround**: Split large PDFs into smaller chunks before upload

### Issue: "503 Unavailable" Errors
**Cause**: Google Gemini API experiencing high demand
**Solution**: Manual retry with "Retry" button (✅ implemented), auto-retry (future)
**Workaround**: Try again in 5-10 minutes when load decreases

### Issue: Search Returns Irrelevant Results
**Cause**: Poor embedding or wrong semantic chunking
**Solution**: Verify PDF extracted correctly, consider better semantic breakpoint
**Debug**: Check ChromaDB for stored embeddings and metadata

### Issue: Memory Leak in Chat
**Cause**: Large message list accumulates in memory
**Solution**: Implement pagination or message virtualization (future)
**Workaround**: Refresh page to clear session (stored in DB)

---

## Glossary

| Term | Definition |
|------|-----------|
| **RAG** | Retrieval Augmented Generation - combining retrieval with generation |
| **Embedding** | Numerical vector representation of text (384-dim in our case) |
| **Semantic Chunking** | Splitting text at natural topic boundaries |
| **ChromaDB** | Vector database for storing and querying embeddings |
| **Cosine Similarity** | Measure of how similar two vectors are (0-1 scale) |
| **Session ID** | Unique identifier for each user's conversation |
| **CORS** | Cross-Origin Resource Sharing - allows frontend-backend communication |
| **LLM** | Large Language Model (Gemini 2.5 Flash in our case) |
| **Metadata** | Data about data (subject, resource_type, page_number) |

---

## Contact & Support

For questions about:
- **Architecture**: See Architecture Overview section
- **RAG Pipeline**: See RAG Pipeline Detailed Flow section
- **Deployment**: See Deployment & Testing section
- **Bug Reports**: Check Common Issues & Solutions
- **Feature Requests**: See Planned Features section

---

**Last Updated**: June 8, 2026
**Project Status**: Active Development
**Version**: 1.0 MVP
