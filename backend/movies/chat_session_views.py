"""
Chat session endpoints — persistent conversation history for CineBot.

GET    /api/chat/sessions/                 → list user's sessions (newest first)
POST   /api/chat/sessions/                 → create session  {title}
DELETE /api/chat/sessions/<id>/            → delete session + all messages
GET    /api/chat/sessions/<id>/messages/   → full message history
POST   /api/chat/sessions/<id>/messages/   → append messages [{role, content}, ...]
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.utils import timezone
from movies.models import ChatSession, ChatMessage


class ChatSessionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = ChatSession.objects.filter(user=request.user).prefetch_related('messages')
        data = []
        for s in sessions:
            last = s.messages.last()
            data.append({
                'id': s.id,
                'title': s.title,
                'last_message': last.content[:80] if last else '',
                'created_at': s.created_at.isoformat(),
                'updated_at': s.updated_at.isoformat(),
            })
        return Response({'success': True, 'data': data})

    def post(self, request):
        title = (request.data.get('title') or 'New conversation').strip()[:120]
        session = ChatSession.objects.create(user=request.user, title=title)
        return Response({
            'success': True,
            'session': {'id': session.id, 'title': session.title, 'created_at': session.created_at.isoformat()},
        }, status=status.HTTP_201_CREATED)


class ChatSessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_session(self, request, pk):
        try:
            return ChatSession.objects.get(id=pk, user=request.user)
        except ChatSession.DoesNotExist:
            return None

    def delete(self, request, pk):
        session = self._get_session(request, pk)
        if not session:
            return Response({'success': False, 'error': 'Not found'}, status=404)
        session.delete()
        return Response({'success': True})


class ChatMessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_session(self, request, pk):
        try:
            return ChatSession.objects.get(id=pk, user=request.user)
        except ChatSession.DoesNotExist:
            return None

    def get(self, request, pk):
        session = self._get_session(request, pk)
        if not session:
            return Response({'success': False, 'error': 'Not found'}, status=404)

        msgs = session.messages.values('id', 'role', 'content', 'created_at')
        return Response({'success': True, 'data': list(msgs)})

    def post(self, request, pk):
        """
        Append messages to a session.
        Body: {"messages": [{"role": "user"|"assistant", "content": "..."}]}
        Also touch session.updated_at so it bubbles to top of sidebar.
        """
        session = self._get_session(request, pk)
        if not session:
            return Response({'success': False, 'error': 'Not found'}, status=404)

        incoming = request.data.get('messages', [])
        if not isinstance(incoming, list) or not incoming:
            return Response({'success': False, 'error': 'messages must be a non-empty list'}, status=400)

        to_create = []
        for m in incoming:
            role = m.get('role', '')
            content = m.get('content', '').strip()
            if role not in ('user', 'assistant') or not content:
                continue
            to_create.append(ChatMessage(session=session, role=role, content=content))

        if not to_create:
            return Response({'success': False, 'error': 'No valid messages'}, status=400)

        ChatMessage.objects.bulk_create(to_create)

        # Touch updated_at so session surfaces at top of sidebar
        ChatSession.objects.filter(id=session.id).update(updated_at=timezone.now())

        return Response({'success': True, 'saved': len(to_create)})
