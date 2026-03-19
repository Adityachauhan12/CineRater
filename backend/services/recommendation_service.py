import json
from typing import List, Dict, Optional
from django.core.cache import cache
from django.conf import settings
from decouple import config
from openai import OpenAI
from movies.repositories import MovieRepository, TVShowRepository
from movies.serializers import MovieSerializer, TVShowSerializer
from services.user_context_service import UserContextService
from services.gemini_service import GeminiService

# Try OpenAI first, fallback to Gemini
try:
    openai_client = OpenAI(api_key=config('OPENAI_API_KEY'))
    USE_OPENAI = True
except:
    USE_OPENAI = False


class RecommendationService:
    """Service for content recommendations (AI-powered and popular)"""
    
    # OpenAI configuration
    OPENAI_API_KEY = config('OPENAI_API_KEY', default='')
    OPENAI_MODEL = config('OPENAI_MODEL', default='gpt-4o-mini')
    
    # Cache TTL
    AI_CACHE_TTL = 1800  # 30 minutes
    
    @staticmethod
    def get_popular_by_region(region: str = 'GLOBAL', limit: int = 10) -> List[Dict]:
        """
        Get popular content by region (movies + TV shows merged)
        
        Args:
            region: Region code (IN/US/GLOBAL)
            limit: Number of items to return
            
        Returns:
            List of popular content sorted by popularity
        """
        # Try specific region first
        movies = MovieRepository.get_popular(region=region, limit=limit)
        tvshows = TVShowRepository.get_popular(region=region, limit=limit)
        
        # If no content in specific region, fallback to all regions
        if not movies and not tvshows and region != 'GLOBAL':
            # Try all regions
            all_movies = []
            all_tvshows = []
            for fallback_region in ['IN', 'US', 'GLOBAL']:
                all_movies.extend(MovieRepository.get_popular(region=fallback_region, limit=limit))
                all_tvshows.extend(TVShowRepository.get_popular(region=fallback_region, limit=limit))
            
            movies = all_movies[:limit]
            tvshows = all_tvshows[:limit]
        
        # Serialize
        movie_data = MovieSerializer(movies, many=True).data
        tvshow_data = TVShowSerializer(tvshows, many=True).data
        
        # Add content_type field
        for item in movie_data:
            item['content_type'] = 'movie'
        for item in tvshow_data:
            item['content_type'] = 'tvshow'
        
        # Merge and sort by popularity_score
        all_content = list(movie_data) + list(tvshow_data)
        all_content.sort(key=lambda x: x['popularity_score'], reverse=True)
        
        return all_content[:limit]
    
    @staticmethod
    def get_ai_recommendations(user, region: str = 'GLOBAL') -> Dict:
        """
        Get AI-powered recommendations for user
        
        Args:
            user: User instance
            region: Region code
            
        Returns:
            Dict with recommendations and metadata
        """
        # Check cache first
        cache_key = f"recs:{user.id}:{region}"
        cached_result = cache.get(cache_key)
        if cached_result:
            return cached_result
        
        try:
            # Step 1: Build user context
            user_context = UserContextService.build_context(user)
            
            # Step 2: Get candidate pool (popular content)
            candidate_pool = RecommendationService.get_popular_by_region(region, limit=20)
            
            # Step 3: If user has no history, return popular
            if user_context['total_ratings'] == 0 and user_context['watchlist_count'] == 0:
                result = {
                    'type': 'popular',
                    'region': region,
                    'data': candidate_pool[:5]
                }
                cache.set(cache_key, result, timeout=RecommendationService.AI_CACHE_TTL)
                return result
            
            # Step 4: Build prompt and call OpenAI
            prompt = RecommendationService._build_prompt(user_context, candidate_pool, region)
            ai_response = RecommendationService._call_openai(prompt)
            
            # Step 5: Parse response and match with DB content
            recommendations = RecommendationService._parse_ai_response(ai_response, candidate_pool)
            
            # Step 6: Build result
            result = {
                'type': 'ai',
                'region': region,
                'data': recommendations
            }
            
            # Cache result
            cache.set(cache_key, result, timeout=RecommendationService.AI_CACHE_TTL)
            
            return result
            
        except Exception as e:
            print(f"AI Recommendation Error: {e}")
            # Fallback to popular content
            result = {
                'type': 'popular',
                'region': region,
                'data': RecommendationService.get_popular_by_region(region, limit=5)
            }
            return result
    
    @staticmethod
    def _build_prompt(user_context: Dict, candidate_pool: List[Dict], region: str) -> str:
        """
        Build OpenAI prompt with user context and candidate pool
        
        Args:
            user_context: User preferences and history
            candidate_pool: Available content to recommend from
            region: User's region
            
        Returns:
            Formatted prompt string
        """
        # Format candidate pool (only titles and genres)
        pool_text = "\n".join([
            f"- {item['title']} ({', '.join(item.get('genres', []))})"
            for item in candidate_pool
        ])
        
        # Format watchlist titles
        watchlist_titles = [item['title'] for item in user_context['watchlist']]
        
        # Format rated content
        rated_text = "\n".join([
            f"- {item['title']} (rated {item['score']}/5.0, genres: {', '.join(item.get('genres', []))})"
            for item in user_context['rated_content'][:5]  # Top 5 recent
        ])
        
        prompt = f"""You are a movie recommendation engine for CineRater app.

User Profile:
- Region: {region}
- Favorite Genres: {', '.join(user_context['favorite_genres']) if user_context['favorite_genres'] else 'None'}
- Total Ratings: {user_context['total_ratings']}
- Watchlist Count: {user_context['watchlist_count']}

Recently Watched/Rated:
{rated_text if rated_text else 'None'}

Current Watchlist:
{', '.join(watchlist_titles) if watchlist_titles else 'None'}

Available Content Pool (recommend ONLY from this list):
{pool_text}

Task: Recommend exactly 5 items from the pool above.

Rules:
1. Prioritize user's favorite genres: {', '.join(user_context['favorite_genres'][:2]) if user_context['favorite_genres'] else 'any'}
2. AVOID content already in watchlist: {', '.join(watchlist_titles)}
3. Consider region preferences for {region}
4. Return ONLY valid JSON, no extra text or markdown

Response format (STRICT JSON):
{{
  "recommendations": [
    {{
      "title": "exact title from pool",
      "reason": "one line why this matches user taste"
    }}
  ]
}}"""
        
        return prompt
    
    @staticmethod
    def _call_openai(prompt: str) -> str:
        """
        Call AI API with prompt (OpenAI first, Gemini fallback)
        
        Args:
            prompt: Formatted prompt
            
        Returns:
            AI response text
        """
        try:
            # Try OpenAI first
            if USE_OPENAI:
                try:
                    response = openai_client.chat.completions.create(
                        model=RecommendationService.OPENAI_MODEL,
                        messages=[
                            {"role": "system", "content": "You are a movie recommendation expert. Always respond with valid JSON only."},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.7,
                        max_tokens=500
                    )
                    return response.choices[0].message.content
                except Exception as e:
                    if "429" in str(e) or "quota" in str(e).lower():
                        print(f"OpenAI quota exceeded, falling back to Gemini: {e}")
                        # Fall through to Gemini
                    else:
                        print(f"OpenAI API Error: {e}")
                        raise e
            
            # Fallback to Gemini
            print("Using Gemini for recommendations")
            messages = [
                {"role": "system", "content": "You are a movie recommendation expert. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ]
            response = GeminiService.chat_completion(messages)
            if response:
                return response
            else:
                raise Exception("Gemini API failed")
            
        except Exception as e:
            print(f"AI API Error: {e}")
            raise e
    
    @staticmethod
    def _parse_ai_response(response_text: str, candidate_pool: List[Dict]) -> List[Dict]:
        """
        Parse OpenAI response and match with actual content
        
        Args:
            response_text: AI response JSON string
            candidate_pool: Available content
            
        Returns:
            List of matched content with AI reasons
        """
        try:
            # Parse JSON response
            response_text = response_text.strip()
            if response_text.startswith('```json'):
                response_text = response_text.replace('```json', '').replace('```', '').strip()
            
            data = json.loads(response_text)
            recommendations = data.get('recommendations', [])
            
            # Match with candidate pool
            result = []
            for rec in recommendations:
                title = rec.get('title', '')
                reason = rec.get('reason', 'Recommended for you')
                
                # Find matching content in pool
                for content in candidate_pool:
                    if content['title'].lower() == title.lower():
                        matched_content = content.copy()
                        matched_content['ai_reason'] = reason
                        result.append(matched_content)
                        break
            
            return result[:5]  # Return max 5
            
        except (json.JSONDecodeError, KeyError) as e:
            print(f"AI Response Parse Error: {e}")
            # Fallback: return top 5 from pool
            return candidate_pool[:5]
