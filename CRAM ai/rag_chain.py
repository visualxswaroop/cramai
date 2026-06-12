import os
import chromadb
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env")

client_genai = genai.Client(api_key=api_key)


# ── 1. Retrieve relevant chunks ───────────────────────────────────────────────
def retrieve_chunks(query: str, subject: str = None, top_k: int = 4):
    response = client_genai.models.embed_content(
        model="gemini-embedding-2",
        contents=query
    )
    query_embedding = response.embeddings[0].values

    client = chromadb.PersistentClient(path="./chroma_store")
    collection = client.get_or_create_collection(name="academic_notes")

    where_filter = {"subject": subject} if subject else None

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where_filter
    )

    return results["documents"][0], results["metadatas"][0]


def build_prompt(query: str, chunks: list[str], marks: int = 5) -> str:
    context = "\n\n---\n\n".join(chunks)

    if marks <= 2:
        length_instruction = "Answer in 2-3 sentences only."
    elif marks <= 5:
        length_instruction = "Answer in clear bullet points, 5-8 lines."
    else:
        length_instruction = (
            "Give a detailed answer with: "
            "1) A one-line definition, "
            "2) Key points in bullets, "
            "3) An example if applicable. "
            "Keep it under 300 words."
        )

    return f"""You are an academic assistant helping engineering students prepare for university exams.

Use ONLY the context provided below to answer the question.
If the answer is not found in the context, say "This topic is not covered in the uploaded notes."
Do NOT use any outside knowledge.

Context from student's notes:
{context}

Question: {query}

Instructions:
- {length_instruction}
- Use simple, clear language suited for exam answers
- If the context has definitions, include them exactly
- Do not make up information not present in the context

Answer:"""


# ── 3. Generate answer with Gemini ────────────────────────────────────────────
def generate_answer(prompt: str) -> str:
    response = client_genai.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=prompt
    )
    return response.text


# ── 4. Full RAG chain ─────────────────────────────────────────────────────────
def ask(query: str, subject: str = None, marks: int = 5):
    print(f"\n{'='*60}")
    print(f"Q: {query}")
    print(f"{'='*60}")

    chunks, metadatas = retrieve_chunks(query, subject)
    print(f"\n[Retrieved {len(chunks)} chunks from: "
          f"{set(m['source'] for m in metadatas)}]\n")

    prompt = build_prompt(query, chunks, marks)
    answer = generate_answer(prompt)

    print("Answer:")
    print("-" * 40)
    print(answer)
    print("-" * 40)

    return answer


if __name__ == "__main__":
    ask("What is ReactJS and why was it created?", subject="FSD", marks=5)
    ask("What is the MVC architecture in React?",  subject="FSD", marks=2)
    ask("Explain virtual DOM in detail",           subject="FSD", marks=10)