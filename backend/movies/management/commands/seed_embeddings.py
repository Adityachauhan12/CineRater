"""
Management command: seed_embeddings

Fetches movies and TV shows from TMDB (popular + top_rated sources) and embeds
them with sentence-transformers (all-MiniLM-L6-v2 — local, free, no API key).
Stores results in the ContentEmbedding table for semantic search.

Key improvements over the old command:
  - Genre IDs → genre names via TMDB genre list endpoint
  - Two sources: popular + top_rated for maximum variety
  - Batch embedding (64 items at a time) — much faster
  - Skips items that already have a valid 384-dim embedding
  - Re-embeds old 768-dim Gemini vectors automatically

Usage:
    python manage.py seed_embeddings               # 250 pages × 2 sources × 2 types ≈ 10 000 items
    python manage.py seed_embeddings --pages 50    # quicker test run (~2 000 items)
    python manage.py seed_embeddings --type movie  # movies only
    python manage.py seed_embeddings --reembed     # force re-embed everything (ignores cache)
"""

import time
import logging
from django.core.management.base import BaseCommand
from movies.models import ContentEmbedding
from services.tmdb_service import TMDBService
from services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)

BATCH_SIZE = 64          # sentence-transformers batch size
TMDB_DELAY = 0.1         # seconds between TMDB page requests (respect rate limit)
VALID_DIM = 384          # sentence-transformers all-MiniLM-L6-v2 output dim


class Command(BaseCommand):
    help = 'Seed ContentEmbedding table with ~10 000 TMDB items using local embeddings'

    def add_arguments(self, parser):
        parser.add_argument(
            '--pages', type=int, default=250,
            help='TMDB pages per source per type (20 items/page). Default: 250 → ~10 000 total',
        )
        parser.add_argument(
            '--type', choices=['movie', 'tvshow', 'all'], default='all',
            help='Content type to seed. Default: all',
        )
        parser.add_argument(
            '--reembed', action='store_true', default=False,
            help='Force re-embedding even if a valid 384-dim embedding exists',
        )

    def handle(self, *args, **options):
        pages = options['pages']
        content_type = options['type']
        reembed = options['reembed']

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\nSeed embeddings — pages={pages}, type={content_type}, reembed={reembed}\n'
        ))

        # Warm up the embedding model once before the loop
        self.stdout.write('Warming up embedding model...')
        EmbeddingService.embed_text('warmup')
        self.stdout.write(self.style.SUCCESS('Model ready.\n'))

        if content_type in ('movie', 'all'):
            self._seed('movie', pages, reembed)

        if content_type in ('tvshow', 'all'):
            self._seed('tvshow', pages, reembed)

        total = ContentEmbedding.objects.count()
        self.stdout.write(self.style.SUCCESS(f'\nDone. Total embeddings in DB: {total}'))

    # ── Internal ──────────────────────────────────────────────────────────────

    def _seed(self, content_type: str, pages: int, reembed: bool):
        self.stdout.write(f'\n{"="*50}')
        self.stdout.write(f'  {content_type.upper()}')
        self.stdout.write(f'{"="*50}')

        # 1. Load genre map (ID → name) from TMDB
        genre_map = TMDBService.get_genre_map(content_type)
        self.stdout.write(f'  Loaded {len(genre_map)} genre definitions')

        # 2. Fetch all pages from both sources, deduped by tmdb_id
        items = self._fetch_all(content_type, pages, genre_map)
        self.stdout.write(f'  Unique items from TMDB: {len(items)}')

        # 3. Decide what needs embedding
        if reembed:
            to_embed = items
        else:
            # Skip items that already have a valid 384-dim embedding
            existing = {
                row['tmdb_id']: row['embedding']
                for row in ContentEmbedding.objects
                .filter(content_type=content_type)
                .values('tmdb_id', 'embedding')
            }
            to_embed = []
            for item in items:
                tid = item['tmdb_id']
                emb = existing.get(tid)
                # Re-embed if: not in DB, or wrong dimension (old Gemini 768-dim)
                if emb is None or len(emb) != VALID_DIM:
                    to_embed.append(item)

        self.stdout.write(f'  To embed: {len(to_embed)} (skipping {len(items) - len(to_embed)} already valid)\n')

        if not to_embed:
            self.stdout.write(self.style.SUCCESS('  All items already have valid embeddings — nothing to do.'))
            return

        # 4. Batch embed + save
        self._embed_and_save(content_type, to_embed)

    def _fetch_all(self, content_type: str, pages: int, genre_map: dict) -> list:
        """Fetch from popular + top_rated, merge, dedupe by tmdb_id."""
        seen = {}  # tmdb_id → item dict

        sources = [
            ('popular', self._fetch_popular),
            ('top_rated', self._fetch_top_rated),
        ]

        for source_name, fetch_fn in sources:
            self.stdout.write(f'  Fetching {source_name}...')
            count = 0
            for page in range(1, pages + 1):
                try:
                    batch = fetch_fn(content_type, page)
                    if not batch:
                        break  # TMDB returned empty — past the end

                    for raw in batch:
                        tmdb_id = raw.get('id')
                        if not tmdb_id:
                            continue
                        title = raw.get('title') or raw.get('name', '')
                        overview = raw.get('overview', '')
                        if not title or not overview:
                            continue

                        # Map genre IDs → names
                        genre_ids = raw.get('genre_ids', [])
                        genres = [genre_map[gid] for gid in genre_ids if gid in genre_map]

                        if tmdb_id not in seen:
                            seen[tmdb_id] = {
                                'tmdb_id': tmdb_id,
                                'title': title,
                                'overview': overview,
                                'genres': genres,
                                'poster_path': raw.get('poster_path', '') or '',
                                'popularity': raw.get('popularity', 0.0),
                                'vote_average': raw.get('vote_average', 0.0),
                                'release_date': raw.get('release_date') or raw.get('first_air_date', ''),
                            }
                            count += 1

                    if page % 50 == 0:
                        self.stdout.write(f'    Page {page}/{pages} — collected {count} new items so far')

                    time.sleep(TMDB_DELAY)

                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'    Page {page} error: {e}'))

            self.stdout.write(f'    → {count} new unique items from {source_name}')

        return list(seen.values())

    def _fetch_popular(self, content_type: str, page: int) -> list:
        if content_type == 'movie':
            return TMDBService.get_popular_movies(page=page)
        return TMDBService.get_popular_tv(page=page)

    def _fetch_top_rated(self, content_type: str, page: int) -> list:
        if content_type == 'movie':
            return TMDBService.get_top_rated_movies(page=page)
        return TMDBService.get_top_rated_tv(page=page)

    def _embed_and_save(self, content_type: str, items: list):
        """Batch embed items and bulk upsert to DB."""
        from sentence_transformers import SentenceTransformer
        model = EmbeddingService._get_model() if hasattr(EmbeddingService, '_get_model') else None

        # Build texts
        texts = []
        for item in items:
            texts.append(EmbeddingService.build_content_text(
                item['title'], item['overview'], item['genres']
            ))

        total = len(texts)
        saved = 0
        errors = 0

        self.stdout.write(f'  Embedding {total} items in batches of {BATCH_SIZE}...')

        for batch_start in range(0, total, BATCH_SIZE):
            batch_texts = texts[batch_start:batch_start + BATCH_SIZE]
            batch_items = items[batch_start:batch_start + BATCH_SIZE]

            try:
                # Batch encode — sentence-transformers handles this natively
                from services.embedding_service import _get_model
                st_model = _get_model()
                vectors = st_model.encode(batch_texts, normalize_embeddings=True, show_progress_bar=False)

                # Upsert each item
                for item, vec in zip(batch_items, vectors):
                    try:
                        ContentEmbedding.objects.update_or_create(
                            tmdb_id=item['tmdb_id'],
                            content_type=content_type,
                            defaults={
                                'title': item['title'],
                                'overview': item['overview'],
                                'genres': item['genres'],
                                'poster_path': item['poster_path'],
                                'popularity': item['popularity'],
                                'vote_average': item['vote_average'],
                                'release_date': item['release_date'],
                                'embedding': vec.tolist(),
                            }
                        )
                        saved += 1
                    except Exception as e:
                        errors += 1
                        logger.error(f"DB save error for {item['title']}: {e}")

            except Exception as e:
                errors += len(batch_items)
                self.stdout.write(self.style.ERROR(f'  Batch {batch_start}–{batch_start + BATCH_SIZE} failed: {e}'))

            # Progress every 10 batches
            done = min(batch_start + BATCH_SIZE, total)
            if (batch_start // BATCH_SIZE) % 10 == 0 or done == total:
                pct = done / total * 100
                self.stdout.write(f'  [{done}/{total}] {pct:.0f}% — saved {saved}')

        self.stdout.write(self.style.SUCCESS(f'  Saved: {saved} | Errors: {errors}'))
