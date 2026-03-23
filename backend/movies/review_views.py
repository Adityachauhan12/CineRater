from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework import status
from services.review_service import ReviewService
from services.rag_service import RAGService


class ContentReviewsView(APIView):
    """
    GET  /api/content/<pk>/reviews/?content_type=movie  — list reviews (public)
    POST /api/content/<pk>/reviews/                     — create/update review (auth)
    """
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get(self, request, pk):
        content_type = request.query_params.get('content_type', 'movie')
        if content_type not in ('movie', 'tvshow'):
            return Response({'success': False, 'error': 'Invalid content_type'}, status=400)

        reviews = ReviewService.list_reviews(content_id=pk, content_type=content_type)
        return Response({'success': True, 'count': len(reviews), 'data': reviews})

    def post(self, request, pk):
        content_type = request.data.get('content_type', 'movie')
        body = request.data.get('body', '').strip()

        if content_type not in ('movie', 'tvshow'):
            return Response({'success': False, 'error': 'Invalid content_type'}, status=400)
        if not body:
            return Response({'success': False, 'error': 'Review body is required'}, status=400)

        try:
            review = ReviewService.create_or_update(
                user=request.user,
                content_id=pk,
                content_type=content_type,
                body=body,
            )
            return Response({
                'success': True,
                'review': {
                    'id': review.id,
                    'user': review.user.username or review.user.email.split('@')[0],
                    'body': review.body,
                    'created_at': review.created_at.isoformat(),
                }
            }, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=400)
        except Exception:
            return Response({'success': False, 'error': 'Internal error'}, status=500)


class ReviewDeleteView(APIView):
    """DELETE /api/content/<pk>/reviews/<review_pk>/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, review_pk):
        deleted = ReviewService.delete_review(user=request.user, review_id=review_pk)
        if deleted:
            return Response({'success': True})
        return Response({'success': False, 'error': 'Review not found'}, status=404)


class ContentAskView(APIView):
    """
    POST /api/content/<pk>/ask/
    Body: {content_type, title, question}
    Returns: {answer, sources, review_count}
    """
    permission_classes = [IsAuthenticatedOrReadOnly]

    def post(self, request, pk):
        content_type = request.data.get('content_type', 'movie')
        title = request.data.get('title', 'this title')
        question = request.data.get('question', '').strip()

        if not question:
            return Response({'success': False, 'error': 'Question is required'}, status=400)

        try:
            result = RAGService.answer(
                content_id=pk,
                content_type=content_type,
                title=title,
                question=question,
            )
            return Response({'success': True, **result})
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=400)
        except Exception as e:
            return Response({'success': False, 'error': 'Internal error'}, status=500)
