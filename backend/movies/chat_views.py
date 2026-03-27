"""
Chat endpoint with SSE streaming.
POST /api/chat/ → streams Server-Sent Events back to the frontend.
"""

import json
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from services.ai_agent_service import run_agent_stream


class AIChatThrottle(UserRateThrottle):
    scope = 'ai_chat'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AIChatThrottle])
def chat_stream(request):
    """
    POST /api/chat/
    Body: {
      "messages": [{"role": "user", "content": "..."}],
      "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
    }
    Returns: text/event-stream SSE response

    SSE event types:
      { "type": "start" }
      { "type": "tool_call", "tool": "search_movies", "args": {...} }
      { "type": "tool_result", "tool": "search_movies", "result": {...} }
      { "type": "text", "content": "..." }   ← streamed in chunks
      { "type": "done" }
      { "type": "error", "message": "..." }
    """
    messages = request.data.get('messages', [])
    history = request.data.get('history', [])

    if not messages:
        return Response({'error': 'messages is required'}, status=400)

    # Combine history + new message, cap at last 20 messages to avoid token overflow
    full_conversation = (history + messages)[-20:]

    def event_stream():
        yield f"data: {json.dumps({'type': 'start'})}\n\n"
        try:
            for chunk in run_agent_stream(full_conversation, request.user):
                yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'  # disable nginx buffering
    return response
