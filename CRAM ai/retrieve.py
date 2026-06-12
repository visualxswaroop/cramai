import os
import chromadb
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env")

client_genai = genai.Client(api_key=api_key)


def retrieve(query: str, subject: str = None, top_k: int = 3):
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

    print(f"\n-- Top {top_k} chunks for: '{query}' --\n")
    for i, (doc, meta) in enumerate(
        zip(results["documents"][0], results["metadatas"][0])
    ):
        print(f"[{i+1}] Source: {meta['source']} | Subject: {meta['subject']}")
        print(f"     {doc[:300]}...")
        print()


if __name__ == "__main__":
    retrieve("Define ReactJs", subject="FSD")