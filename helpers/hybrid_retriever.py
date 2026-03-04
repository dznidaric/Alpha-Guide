import asyncio
from collections import defaultdict

class HybridRetriever:
    def __init__(self, dense_retriever, bm25_retriever, k_dense=20, k_bm25=20, k_final=8):
        self.dense = dense_retriever
        self.bm25 = bm25_retriever
        self.k_dense = k_dense
        self.k_bm25 = k_bm25
        self.k_final = k_final

    def _doc_key(self, d):
        return (
            d.metadata.get("source"),
            d.metadata.get("page"),
            (d.page_content or "")[:120]
        )

    async def ainvoke(self, query: str):
        dense_docs, bm25_docs = await asyncio.gather(
            self.dense.ainvoke(query),
            self.bm25.ainvoke(query),
        )

        dense_docs = (dense_docs or [])[: self.k_dense]
        bm25_docs = (bm25_docs or [])[: self.k_bm25]

        scores = defaultdict(float)
        by_key = {}

        # Reciprocal Rank Fusion
        for rank, d in enumerate(dense_docs, start=1):
            key = self._doc_key(d)
            by_key[key] = d
            scores[key] += 1.0 / (rank + 20)

        for rank, d in enumerate(bm25_docs, start=1):
            key = self._doc_key(d)
            by_key[key] = d
            scores[key] += 1.0 / (rank + 20)

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return [by_key[key] for key, _ in ranked[: self.k_final]]

    # Optional: sync interface too
    def invoke(self, query: str):
        dense_docs = self.dense.invoke(query)[: self.k_dense]
        bm25_docs = self.bm25.invoke(query)[: self.k_bm25]

        scores = defaultdict(float)
        by_key = {}

        for rank, d in enumerate(dense_docs, start=1):
            key = self._doc_key(d)
            by_key[key] = d
            scores[key] += 1.0 / (rank + 20)

        for rank, d in enumerate(bm25_docs, start=1):
            key = self._doc_key(d)
            by_key[key] = d
            scores[key] += 1.0 / (rank + 20)

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return [by_key[key] for key, _ in ranked[: self.k_final]]