from django.core.management.base import BaseCommand
from services.tmdb_service import TMDBService
from movies.repositories import MovieRepository, TVShowRepository


class Command(BaseCommand):
    help = 'Seed database with movies and TV shows from TMDB'

    def handle(self, *args, **options):
        self.stdout.write('Fetching data from TMDB...')
        
        # Fetch 5 popular movies
        movies_data = TMDBService.get_popular_movies(region='IN', page=1)
        movies_created = 0
        
        for movie_data in movies_data[:5]:
            # Get detailed info
            movie_details = TMDBService.get_movie_details(movie_data['id'])
            if not movie_details:
                continue
            
            # Check if already exists
            if MovieRepository.get_by_tmdb_id(movie_details['id']):
                self.stdout.write(f"Movie '{movie_details['title']}' already exists, skipping...")
                continue
            
            # Add region
            movie_details['region'] = 'IN'
            
            # Create movie
            try:
                movie = MovieRepository.create_from_tmdb(movie_details)
                movies_created += 1
                self.stdout.write(self.style.SUCCESS(f"✓ Created movie: {movie.title}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"✗ Failed to create movie: {e}"))
        
        # Fetch 2 popular TV shows
        tvshows_data = TMDBService.get_popular_tv(region='IN', page=1)
        tvshows_created = 0
        
        for tv_data in tvshows_data[:2]:
            # Get detailed info
            tv_details = TMDBService.get_tv_details(tv_data['id'])
            if not tv_details:
                continue
            
            # Check if already exists
            if TVShowRepository.get_by_tmdb_id(tv_details['id']):
                self.stdout.write(f"TV Show '{tv_details['name']}' already exists, skipping...")
                continue
            
            # Add region
            tv_details['region'] = 'IN'
            
            # Create TV show
            try:
                tvshow = TVShowRepository.create_from_tmdb(tv_details)
                tvshows_created += 1
                self.stdout.write(self.style.SUCCESS(f"✓ Created TV show: {tvshow.title}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"✗ Failed to create TV show: {e}"))
        
        self.stdout.write(self.style.SUCCESS(f'\nSeeding complete!'))
        self.stdout.write(f'Movies created: {movies_created}')
        self.stdout.write(f'TV Shows created: {tvshows_created}')
