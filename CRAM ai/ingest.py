import os
import time
import re
import fitz
import chromadb
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError
from langchain_text_splitters import RecursiveCharacterTextSplitter

load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env")

print("API Key Found")

client_genai = genai.Client(api_key=api_key)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200
)


# ── 1. Extract text from PDF ──────────────────────────────────────────────────
def extract_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    full_text = ""
    for page_num, page in enumerate(doc):
        text = page.get_text()
        if text.strip():
            full_text += f"\n[Page {page_num + 1}]\n{text}"
    doc.close()
    print(f"Extracted {len(full_text)} characters from {pdf_path}")
    return full_text


# ── 2. Chunking ──────────────────────────────────────────────────────────────
def chunk_text(text: str) -> list[str]:
    print("Running text splitting...")
    chunks = text_splitter.split_text(text)
    chunks = [c.strip() for c in chunks if len(c.strip()) > 0]
    print(f"Created {len(chunks)} chunks")
    return chunks


# ── 3. Generate embeddings with rate limit handling ───────────────────────────
def embed_chunks(chunks: list[str]) -> list[list[float]]:
    print("Generating embeddings via Gemini API...")
    if not chunks:
        return []
    
    all_embeddings = []
    batch_size = 20
    base_delay = 12.0  # 20 items per 12 seconds keeps us within the 100 RPM limit
    
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        contents = [types.Content(parts=[types.Part.from_text(text=t)]) for t in batch]
        
        # Retry loop for this batch
        success = False
        attempt = 0
        while not success:
            try:
                response = client_genai.models.embed_content(
                    model="gemini-embedding-2",
                    contents=contents
                )
                all_embeddings.extend([emb.values for emb in response.embeddings])
                success = True
                break
            except Exception as e:
                err_msg = str(e)
                is_rate_limit = "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower()
                
                if is_rate_limit:
                    # Parse the suggested retry time if available, otherwise use a safe default
                    match = re.search(r"retry in ([\d\.]+)s", err_msg)
                    if match:
                        sleep_time = float(match.group(1)) + 1.0  # add 1s safety margin
                    else:
                        sleep_time = 15.0 * (1.5 ** attempt)
                    print(f"Rate limit hit at chunk index {i}. Waiting for {sleep_time:.2f} seconds...")
                    time.sleep(sleep_time)
                    attempt += 1
                else:
                    raise e
        
        # Add a delay between successful batches to respect the rate limit
        if success and i + batch_size < len(chunks):
            time.sleep(base_delay)
        
    print(f"Generated {len(all_embeddings)} embeddings")
    return all_embeddings


# ── 4. Store in ChromaDB ──────────────────────────────────────────────────────
def store_in_chromadb(
    chunks: list[str],
    embeddings: list[list[float]],
    subject: str,
    source_file: str,
    resource_type: str = "notes"
):
    client = chromadb.PersistentClient(path="./chroma_store")
    collection = client.get_or_create_collection(name="academic_notes")

    ids = [f"{source_file}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "subject": subject,
            "source": source_file,
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

    new_ids, new_embs, new_docs, new_metas = [], [], [], []
    for i in range(len(ids)):
        if ids[i] not in existing_ids:
            new_ids.append(ids[i])
            new_embs.append(embeddings[i])
            new_docs.append(chunks[i])
            new_metas.append(metadatas[i])

    if new_ids:
        collection.add(
            ids=new_ids,
            embeddings=new_embs,
            documents=new_docs,
            metadatas=new_metas
        )

    print(f"Stored {len(new_ids)} new chunks | Skipped {len(chunks) - len(new_ids)} duplicates")
    print(f"  Subject: {subject} | Type: {resource_type} | Source: {source_file}")


# ── 5. Full pipeline ──────────────────────────────────────────────────────────
def ingest(pdf_path: str, subject: str, resource_type: str = "notes"):
    """
    resource_type options:
      - "notes"        → lecture notes / slides
      - "pyq"          → previous year questions
      - "imp"          → important questions list
      - "questionbank" → question bank with answers
    """
    print(f"\n-- Ingesting: {pdf_path} [{resource_type.upper()}] --")
    text = extract_text(pdf_path)
    chunks = chunk_text(text)
    embeddings = embed_chunks(chunks)
    store_in_chromadb(chunks, embeddings, subject, os.path.basename(pdf_path), resource_type)
    print("\nIngestion Complete!\n")


if __name__ == "__main__":
    ingest(
        pdf_path="notes.pdf",
        subject="FSD",
        resource_type="notes"
    )