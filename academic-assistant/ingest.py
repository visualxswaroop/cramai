import os
import fitz
import chromadb
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from langchain_experimental.text_splitter import SemanticChunker
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env")

print("✓ API Key Found")

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

semantic_chunker = SemanticChunker(
    embeddings=HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2"),
    breakpoint_threshold_type="percentile",
    breakpoint_threshold_amount=85
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
    print(f"✓ Extracted {len(full_text)} characters from {pdf_path}")
    return full_text


# ── 2. Semantic chunking ──────────────────────────────────────────────────────
def chunk_text(text: str) -> list[str]:
    print("Running semantic chunking (this takes a moment)...")
    chunks = semantic_chunker.split_text(text)
    chunks = [c.strip() for c in chunks if len(c.strip()) > 80]
    print(f"✓ Created {len(chunks)} semantic chunks")
    return chunks


# ── 3. Generate embeddings ────────────────────────────────────────────────────
def embed_chunks(chunks: list[str]) -> list[list[float]]:
    print("Generating embeddings...")
    embeddings = embedding_model.encode(
        chunks,
        batch_size=32,
        show_progress_bar=True,
        convert_to_numpy=True
    )
    print(f"✓ Generated {len(embeddings)} embeddings")
    return embeddings.tolist()


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

    print(f"✓ Stored {len(new_ids)} new chunks | Skipped {len(chunks) - len(new_ids)} duplicates")
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
    print(f"\n── Ingesting: {pdf_path} [{resource_type.upper()}] ──")
    text = extract_text(pdf_path)
    chunks = chunk_text(text)
    embeddings = embed_chunks(chunks)
    store_in_chromadb(chunks, embeddings, subject, os.path.basename(pdf_path), resource_type)
    print("\n✅ Ingestion Complete!\n")


if __name__ == "__main__":
    ingest(
        pdf_path="notes.pdf",
        subject="FSD",
        resource_type="notes"
    )