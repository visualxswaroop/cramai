import os
import sqlite3
import uuid
import fitz
import chromadb
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from sentence_transformers import SentenceTransformer
from langchain_experimental.text_splitter import SemanticChunker
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

app = FastAPI(title="Cram API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Clients ───────────────────────────────────────────────────────────────────
client_genai = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
chroma_client = chromadb.PersistentClient(path="./chroma_store")
collection = chroma_client.get_or_create_collection(name="academic_notes")

semantic_chunker = SemanticChunker(
    embeddings=HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2"),
    breakpoint_threshold_type="percentile",
    breakpoint_threshold_amount=85
)

# ── In-memory job tracker ─────────────────────────────────────────────────────
# job_id -> {"status": "processing"|"done"|"error", "chunks_stored": int, "error": str}
jobs: dict = {}

# ── Database setup ────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect("chat_history.db")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            role TEXT,
            content TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()


# ── Helpers ───────────────────────────────────────────────────────────────────
def extract_text(file_bytes: bytes) -> str:
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError("Could not open PDF. Ensure the file is a valid PDF document.") from exc

    text = ""
    for page_num, page in enumerate(doc):
        page_text = page.get_text("text")
        if page_text.strip():
            text += f"\n[Page {page_num + 1}]\n{page_text}"
    doc.close()
    return text


def chunk_text_semantic(text: str) -> list[str]:
    chunks = semantic_chunker.split_text(text)
    chunks = [c.strip() for c in chunks if len(c.strip()) > 80]
    return chunks


def embed(texts: list[str]) -> list[list[float]]:
    return embedding_model.encode(
        texts, batch_size=32, convert_to_numpy=True
    ).tolist()


# ── Background ingestion task ─────────────────────────────────────────────────
def run_ingestion(job_id: str, file_bytes: bytes, filename: str,
                  subject: str, resource_type: str):
    try:
        jobs[job_id] = {"status": "processing", "chunks_stored": 0}

        text = extract_text(file_bytes)
        if not text.strip():
            jobs[job_id] = {"status": "error", "error": "Could not extract text. PDF may be scanned."}
            return

        chunks = chunk_text_semantic(text)
        embeddings = embed(chunks)

        ids = [f"{filename}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "subject": subject,
                "source": filename,
                "chunk_index": i,
                "resource_type": resource_type,
                "chunk_length": len(chunks[i])
            }
            for i in range(len(chunks))
        ]

        try:
            existing_ids = set(collection.get()["ids"])
        except Exception:
            existing_ids = set()

        new = [
            (i, e, c, m) for i, e, c, m in zip(ids, embeddings, chunks, metadatas)
            if i not in existing_ids
        ]

        if new:
            collection.add(
                ids=[x[0] for x in new],
                embeddings=[x[1] for x in new],
                documents=[x[2] for x in new],
                metadatas=[x[3] for x in new]
            )

        jobs[job_id] = {
            "status": "done",
            "chunks_stored": len(new),
            "chunks_skipped": len(chunks) - len(new),
            "subject": subject,
            "filename": filename,
            "resource_type": resource_type
        }

    except Exception as exc:
        jobs[job_id] = {"status": "error", "error": str(exc)}


# ── Query expansion ───────────────────────────────────────────────────────────
def expand_query(query: str) -> list[str]:
    prompt = f"""You are helping retrieve information from university lecture notes.
Given a student's question, generate 3 alternative search queries to find relevant content.
Return ONLY the queries as a numbered list, nothing else.

Student question: {query}

Alternative queries:"""
    try:
        response = client_genai.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=prompt
        )
        lines = response.text.strip().split("\n")
        expanded = []
        for line in lines:
            line = line.strip()
            if line and line[0].isdigit():
                cleaned = line.split(".", 1)[-1].strip()
                if cleaned:
                    expanded.append(cleaned)
        return [query] + expanded[:3]
    except Exception:
        return [query]


# ── Retrieval with query expansion ────────────────────────────────────────────
def retrieve_chunks(query: str, subject: str = None, top_k: int = 5):
    queries = expand_query(query)
    where_filter = {"subject": subject} if subject else None

    seen_ids = set()
    all_chunks = []
    all_metadatas = []

    for q in queries:
        q_embedding = embedding_model.encode(q).tolist()
        try:
            results = collection.query(
                query_embeddings=[q_embedding],
                n_results=top_k,
                where=where_filter
            )
            for doc, meta, rid in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["ids"][0]
            ):
                if rid not in seen_ids:
                    seen_ids.add(rid)
                    all_chunks.append(doc)
                    all_metadatas.append(meta)
        except Exception:
            continue

    return all_chunks[:top_k * 2], all_metadatas[:top_k * 2]


# ── Prompt builder ────────────────────────────────────────────────────────────
def build_prompt(query: str, chunks: list[str], marks: int = 5,
                 resource_type: str = "notes") -> str:
    context = "\n\n---\n\n".join(chunks)

    if marks <= 2:
        length_instruction = "Write a precise 2-3 sentence answer. State the definition or core fact directly. No extra detail."
        word_target = "40-60 words"
    elif marks <= 5:
        length_instruction = (
            "Write a structured answer with:\n"
            "- A one-line definition\n"
            "- 4-6 key points as bullet points\n"
            "- One small example if available in the notes"
        )
        word_target = "150-200 words"
    else:
        length_instruction = (
            "Write a comprehensive exam answer structured as follows:\n"
            "1. **Definition/Introduction** - Define the concept clearly (2-3 sentences)\n"
            "2. **Detailed Explanation** - Cover all key aspects with numbered points\n"
            "3. **Types/Categories** - List and explain any types or classifications\n"
            "4. **Working/Process** - Explain how it works step by step if applicable\n"
            "5. **Advantages & Disadvantages** - If mentioned in the notes\n"
            "6. **Example** - Give a concrete example from the notes\n"
            "7. **Conclusion** - One closing sentence\n\n"
            "Use bold headings for each section. Write as if filling exam answer sheets."
        )
        word_target = "500-700 words minimum"

    if resource_type == "pyq":
        resource_note = "This appears to be a previous year exam question. Match the exact depth and format expected in university exams."
    elif resource_type == "imp":
        resource_note = "This is an important question. Give a thorough answer covering all aspects likely to be tested."
    elif resource_type == "questionbank":
        resource_note = "Answer from the question bank context. Be comprehensive and exam-ready."
    else:
        resource_note = "Answer based on the lecture notes provided."

    return f"""You are Cram, an AI exam assistant for Indian engineering university students.

{resource_note}
Target length: {word_target}

STRICT RULES:
- Use ONLY the context below. Do not use outside knowledge.
- If the answer is not in the context, say exactly: "This topic is not covered in the uploaded notes."
- Write in clear, exam-appropriate language
- Use the exact definitions and terminology from the notes
- Structure your answer for maximum marks in a university exam

Context from student's notes:
{context}

Question ({marks} marks): {query}

Instructions:
{length_instruction}

Answer:"""


def save_message(session_id: str, role: str, content: str):
    conn = sqlite3.connect("chat_history.db")
    conn.execute(
        "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
        (session_id, role, content)
    )
    conn.commit()
    conn.close()


def get_history(session_id: str) -> list[dict]:
    conn = sqlite3.connect("chat_history.db")
    rows = conn.execute(
        "SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp",
        (session_id,)
    ).fetchall()
    conn.close()
    return [{"role": r[0], "content": r[1]} for r in rows]


# ── Request models ────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    question: str
    subject: str = None
    marks: int = 5
    session_id: str = "default"
    resource_type: str = "notes"


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "Cram API is running"}


@app.post("/ingest")
async def ingest(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subject: str = Form(...),
    resource_type: str = Form("notes")
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_bytes = await file.read()

    # Generate a job ID and kick off background processing
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "processing", "chunks_stored": 0}

    background_tasks.add_task(
        run_ingestion, job_id, file_bytes, file.filename, subject, resource_type
    )

    # Return immediately — frontend polls /ingest/status/{job_id}
    return {
        "message": "Ingestion started",
        "job_id": job_id,
        "filename": file.filename,
        "subject": subject,
        "resource_type": resource_type
    }


@app.get("/ingest/status/{job_id}")
def ingest_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/chat")
def chat(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    save_message(req.session_id, "user", req.question)
    chunks, metadatas = retrieve_chunks(req.question, req.subject)

    resource_type = req.resource_type
    if metadatas:
        resource_type = metadatas[0].get("resource_type", "notes")

    prompt = build_prompt(req.question, chunks, req.marks, resource_type)

    try:
        response = client_genai.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=prompt
        )
        answer = response.text
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    save_message(req.session_id, "assistant", answer)

    return {
        "answer": answer,
        "sources": [
            {
                "source": m["source"],
                "subject": m["subject"],
                "resource_type": m.get("resource_type", "notes")
            }
            for m in metadatas
        ],
        "session_id": req.session_id,
        "queries_used": len(chunks)
    }


@app.get("/history/{session_id}")
def history(session_id: str):
    return {"session_id": session_id, "messages": get_history(session_id)}


@app.get("/subjects")
def list_subjects():
    try:
        all_items = collection.get()
        subjects = list(set(m["subject"] for m in all_items["metadatas"]))
    except Exception:
        subjects = []
    return {"subjects": subjects}


@app.get("/resources/{subject}")
def list_resources(subject: str):
    try:
        all_items = collection.get(where={"subject": subject})
        resources = {}
        for m in all_items["metadatas"]:
            key = m["source"]
            if key not in resources:
                resources[key] = {
                    "source": m["source"],
                    "resource_type": m.get("resource_type", "notes"),
                    "subject": m["subject"]
                }
        return {"subject": subject, "resources": list(resources.values())}
    except Exception:
        return {"subject": subject, "resources": []}