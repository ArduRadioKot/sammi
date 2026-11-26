import math
from collections import Counter
from functools import lru_cache

import numpy as np

from app.schemas.relationship import Source
from app.services.relationship.text import TECHNOLOGIES, rank, tokens

# Normalize common paraphrases to the business concept used in the report.
CONCEPTS = {
    **TECHNOLOGIES,
    "Миграция инфраструктуры": (*TECHNOLOGIES["Миграция инфраструктуры"], "перенос сервисов", "переезд системы",
                                "перенести сервис", "смена платформы", "перенести систему"),
    "Управление доступом": ("разграничение прав", "доступ по ролям", "управление доступом", "iam", "rbac"),
    "Бюджет и согласование": ("право подписи", "подпись бюджета", "утвердить смету", "выделить финансирование",
                             "финансирование", "бюджет", "согласование расходов"),
    "Контур пилота": ("пилот", "проверка гипотезы", "проверка концепции", "пробное внедрение", "poc"),
}
MAX_LATENT_DOCUMENTS = 96
MAX_LATENT_TERMS = 1200
LATENT_DIMENSIONS = 24


@lru_cache(maxsize=1)
def _concept_terms() -> tuple[tuple[str, tuple[str, ...]], ...]:
    return tuple((label, tuple(" ".join(tokens(alias)) for alias in aliases)) for label, aliases in CONCEPTS.items())


@lru_cache(maxsize=8192)
def _features(text: str) -> Counter:
    words = tokens(text)
    result = Counter(words)
    sequence = " " + " ".join(words) + " "
    for concept, aliases in _concept_terms():
        if any(f" {alias} " in sequence for alias in aliases if alias):
            result[f"concept:{concept}"] = 3
    return result


def similarity(first: str, second: str) -> float:
    left, right = _features(first), _features(second)
    norm = math.sqrt(sum(value ** 2 for value in left.values()) * sum(value ** 2 for value in right.values()))
    return sum(left[term] * right[term] for term in left.keys() & right.keys()) / norm if norm else 0.0


def _latent_rank(query: str, sources: list[Source], limit: int) -> list[Source]:
    query_features = _features(query)
    if not query_features or not sources:
        return []
    queries = [
        (similarity(query, source.text), source)
        for source in sources
    ]
    queries.sort(key=lambda item: item[0], reverse=True)
    if queries[0][0] <= 0:
        return []
    selected = [source for _, source in queries[:MAX_LATENT_DOCUMENTS]]
    features = [_features(source.text) for source in selected]
    document_frequency = Counter(term for document in features for term in document)
    # Keep query terms even when the rest of the vocabulary reaches the limit.
    vocabulary = list(dict.fromkeys([*query_features, *(term for term, _ in document_frequency.most_common(MAX_LATENT_TERMS))]))
    vocabulary = vocabulary[:MAX_LATENT_TERMS]
    weights = np.array([math.log1p(len(features) / (1 + document_frequency[term])) for term in vocabulary])
    matrix = np.array([[document.get(term, 0) for term in vocabulary] for document in features], dtype=np.float64)
    matrix *= weights
    matrix /= np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-8)
    query_vector = np.array([query_features.get(term, 0) for term in vocabulary]) * weights
    # Eigensystem of the document Gram matrix yields an LSA projection without an external encoder.
    values, vectors = np.linalg.eigh(matrix @ matrix.T)
    keep = min(LATENT_DIMENSIONS, int(np.count_nonzero(values > 1e-7)))
    if not keep:
        return []
    singular = np.sqrt(values[-keep:])
    basis = vectors[:, -keep:]
    embedded_documents = basis * singular
    embedded_query = (query_vector @ matrix.T @ basis) / singular
    norm = np.linalg.norm(embedded_query)
    if norm <= 1e-8:
        return []
    similarities = (embedded_documents @ embedded_query) / (
        np.maximum(np.linalg.norm(embedded_documents, axis=1), 1e-8) * norm
    )
    # Rank latent neighbors with direct concept/term support first in nearly identical small corpora.
    candidates = [
        (float(score) * 0.8 + 0.2 * direct, source)
        for score, (direct, source) in zip(similarities, queries[:MAX_LATENT_DOCUMENTS])
        if score >= 0.22
    ]
    candidates.sort(key=lambda item: item[0], reverse=True)
    return [source for _, source in candidates[:limit]]


def hybrid_rank(query: str, sources: list[Source], limit: int) -> list[Source]:
    lexical = rank(query, sources, max(12, limit))
    latent = _latent_rank(query, sources, max(12, limit))
    result: dict[str, tuple[float, Source]] = {}
    for order, weight in ((lexical, 1.0), (latent, 0.85)):
        for position, source in enumerate(order, 1):
            score, _ = result.get(source.id, (0.0, source))
            result[source.id] = score + weight / (8 + position), source
    return [source for _, source in sorted(result.values(), key=lambda item: item[0], reverse=True)[:limit]]
