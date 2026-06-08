import chromadb
from sentence_transformers import SentenceTransformer

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")


def retrieve(query: str, subject: str = None, top_k: int = 3):
    query_embedding = embedding_model.encode(query).tolist()

    client = chromadb.PersistentClient(path="./chroma_store")
    collection = client.get_or_create_collection(name="academic_notes")

    where_filter = {"subject": subject} if subject else None

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where_filter
    )

    print(f"\n── Top {top_k} chunks for: '{query}' ──\n")
    for i, (doc, meta) in enumerate(
        zip(results["documents"][0], results["metadatas"][0])
    ):
        print(f"[{i+1}] Source: {meta['source']} | Subject: {meta['subject']}")
        print(f"     {doc[:300]}...")
        print()


if __name__ == "__main__":
    retrieve("Define ReactJs", subject="FSD")