"""
IMDB Import endpoint.

POST /api/import/imdb/
  - Multipart form: file (CSV), import_type ('ratings' | 'watchlist')
  - Parses IMDB export CSV, looks up each IMDB ID on TMDB, creates Rating or Watchlist entries.
  - Uses ThreadPoolExecutor for parallel TMDB lookups (1000 movies ≈ 10-15s).

IMDB Ratings CSV columns:
  Const, Your Rating, Date Rated, Title, URL, Title Type, IMDb Rating, ...

IMDB Watchlist CSV columns:
  Const, Created, Modified, Description, Title, URL, Title Type, ...

Score mapping: IMDB 1-10 → CineRater 1.0-10.0 (direct mapping, rounded to 1 decimal)
"""

import csv
import io
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework import status
from movies.models import Rating, Watchlist
from services.tmdb_service import TMDBService

logger = logging.getLogger(__name__)

SKIP_TYPES = {'videoGame', 'short', 'tvShort', 'video'}
MAX_WORKERS = 10


def _imdb_score_to_cinerater(imdb_score: str) -> float:
    """Convert IMDB 1-10 score to CineRater 1.0-10.0 (direct mapping)."""
    try:
        score = float(imdb_score)
        return max(1.0, min(10.0, round(score, 1)))
    except (ValueError, TypeError):
        return 5.0


def _parse_csv(file_bytes: bytes) -> list[dict]:
    """Parse IMDB CSV bytes into list of row dicts."""
    text = file_bytes.decode('utf-8-sig')  # utf-8-sig strips BOM if present
    reader = csv.DictReader(io.StringIO(text))
    return [row for row in reader]


class ImdbImportView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        import_type = request.data.get('import_type', 'ratings')  # 'ratings' or 'watchlist'

        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        if import_type not in ('ratings', 'watchlist'):
            return Response({'error': 'import_type must be ratings or watchlist'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rows = _parse_csv(file.read())
        except Exception as e:
            return Response({'error': f'CSV parse error: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        # Filter out unsupported content types and rows without an IMDB ID
        valid_rows = []
        for row in rows:
            imdb_id = row.get('Const', '').strip()
            title_type = row.get('Title Type', '').strip()
            if not imdb_id or not imdb_id.startswith('tt'):
                continue
            if title_type in SKIP_TYPES:
                continue
            valid_rows.append(row)

        if not valid_rows:
            return Response({
                'imported': 0, 'duplicates': 0, 'not_found': 0,
                'message': 'No importable rows found in CSV.',
            })

        # Parallel TMDB lookups
        def lookup(row):
            imdb_id = row['Const'].strip()
            result = TMDBService.find_by_imdb_id(imdb_id)
            return row, result

        tmdb_results = {}  # imdb_id → tmdb result or None
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(lookup, row): row for row in valid_rows}
            for future in as_completed(futures):
                try:
                    row, result = future.result()
                    tmdb_results[row['Const'].strip()] = (row, result)
                except Exception as e:
                    logger.warning(f"TMDB lookup error: {e}")

        # Create DB entries
        imported = 0
        duplicates = 0
        not_found = 0

        for imdb_id, (row, tmdb) in tmdb_results.items():
            if tmdb is None:
                not_found += 1
                continue

            content_id = tmdb['id']
            content_type = tmdb['content_type']

            try:
                if import_type == 'ratings':
                    score = _imdb_score_to_cinerater(row.get('Your Rating', ''))
                    _, created = Rating.objects.get_or_create(
                        user=request.user,
                        content_id=content_id,
                        content_type=content_type,
                        defaults={'score': score},
                    )
                    if created:
                        imported += 1
                    else:
                        duplicates += 1

                else:  # watchlist
                    _, created = Watchlist.objects.get_or_create(
                        user=request.user,
                        content_id=content_id,
                        content_type=content_type,
                    )
                    if created:
                        imported += 1
                    else:
                        duplicates += 1

            except Exception as e:
                logger.error(f"DB save error for {imdb_id}: {e}")
                not_found += 1

        return Response({
            'imported': imported,
            'duplicates': duplicates,
            'not_found': not_found,
            'total_rows': len(valid_rows),
            'message': f'Imported {imported} items. {duplicates} already existed. {not_found} not found on TMDB.',
        })
