"""
Management command: seed_embeddings

Fetches popular movies and TV shows from TMDB, embeds their descriptions
using Gemini, and stores them in the ContentEmbedding table.

This gives semantic search a large, pre-computed candidate pool instead of
only the 80 live popular results.

Usage:
    python manage.py seed_embeddings                  # 25 pages each (~500 movies + 500 shows)
    python manage.py seed_embeddings --pages 50       # ~1000 movies + 1000 shows
    python manage.py seed_embeddings --type movie     # movies only
    python manage.py seed_embeddings --delay 0.3      # faster (risk: rate limit)

Resumable: already-embedded items are skipped automatically.
Rate limit: Gemini free tier = 1,500 requests/day. Default delay=0.5s
keeps you well within that if you run in short sessions.
"""

import time
import logging
from django.core.management.base import BaseCommand
from movies.models import ContentEmbedding
from services.tmdb_service import TMDBService
from services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Seed ContentEmbedding table with TMDB popular content'

    def add_arguments(self, parser):
        parser.add_argument(
            '--pages', type=int, default=25,
            help='Number of TMDB pages to fetch per content type (20 items/page). Default: 25'
        )
        parser.add_argument(
            '--type', choices=['movie', 'tvshow', 'all'], default='all',
            help='Content type to seed. Default: all'
        )
        parser.add_argument(
            '--delay', type=float, default=0.5,
            help='Seconds to wait between Gemini embedding calls. Default: 0.5'
        )

    def handle(self, *args, **options):
        pages = options['pages']
        content_type = options['type']
        delay = options['delay']

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\nSeeding embeddings — {pages} pages, type={content_type}, delay={delay}s\n'
        ))

        if content_type in ('movie', 'all'):
            self._seed('movie', pages, delay)

        if content_type in ('tvshow', 'all'):
            self._seed('tvshow', pages, delay)

        total = ContentEmbedding.objects.count()
        self.stdout.write(self.style.SUCCESS(f'\nDone. Total embeddings in DB: {total}'))

    def _seed(self, content_type: str, pages: int, delay: float):
        self.stdout.write(f'\n--- {content_type.upper()} ---')

        # Collect all TMDB items across pages
        items = []
        for page in range(1, pages + 1):
            try:
                if content_type == 'movie':
                    batch = TMDBService.get_popular_movies(page=page)
                else:
                    batch = TMDBService.get_popular_tv(page=page)
                items.extend(batch)
                self.stdout.write(f'  Fetched page {page}/{pages} ({len(batch)} items)')
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'  Page {page} failed: {e}'))

        self.stdout.write(f'  Total candidates: {len(items)}')

        # Find which tmdb_ids are already embedded (for resume support)
        existing_ids = set(
            ContentEmbedding.objects
            .filter(content_type=content_type)
            .values_list('tmdb_id', flat=True)
        )
        to_process = [i for i in items if i.get('id') not in existing_ids]
        self.stdout.write(f'  Already embedded: {len(existing_ids)} — To embed: {len(to_process)}')

        embedded = 0
        skipped = 0

        for idx, item in enumerate(to_process, 1):
            tmdb_id = item.get('id')
            title = item.get('title') or item.get('name', '')
            overview = item.get('overview', '')
            genres = item.get('genre_ids', [])  # popular list gives IDs, not names
            poster_path = item.get('poster_path', '') or ''
            popularity = item.get('popularity', 0.0)
            vote_average = item.get('vote_average', 0.0)
            release_date = item.get('release_date') or item.get('first_air_date', '')

            if not title or not overview:
                skipped += 1
                continue

            # Build text for embedding — use genre_ids as strings since popular list
            # doesn't include genre names (would need extra API call per item)
            embed_text = EmbeddingService.build_content_text(title, overview, [])

            try:
                embedding = EmbeddingService.embed_text(embed_text)
                if not embedding:
                    self.stdout.write(self.style.WARNING(
                        f'  [{idx}/{len(to_process)}] Embedding failed for "{title}" — skipping'
                    ))
                    skipped += 1
                    continue

                ContentEmbedding.objects.update_or_create(
                    tmdb_id=tmdb_id,
                    content_type=content_type,
                    defaults={
                        'title': title,
                        'overview': overview,
                        'genres': genres,
                        'poster_path': poster_path,
                        'popularity': popularity,
                        'vote_average': vote_average,
                        'release_date': release_date,
                        'embedding': embedding,
                    }
                )
                embedded += 1

                if idx % 10 == 0 or idx == len(to_process):
                    pct = (idx / len(to_process)) * 100
                    self.stdout.write(
                        f'  [{idx}/{len(to_process)}] {pct:.0f}% — last: "{title}"'
                    )

                time.sleep(delay)

            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  Error on "{title}": {e}'))
                skipped += 1

        self.stdout.write(self.style.SUCCESS(
            f'  Embedded: {embedded} | Skipped: {skipped}'
        ))
