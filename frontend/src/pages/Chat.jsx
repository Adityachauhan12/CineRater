import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftIcon, PaperAirplaneIcon, FilmIcon,
  PlusIcon, TrashIcon, Bars3Icon, ChevronLeftIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';
import {
  getChatSessions, createChatSession, deleteChatSession,
  getChatMessages, saveChatMessages,
} from '../services/api';

const API_BASE = 'http://127.0.0.1:8000/api';

const SUGGESTED_PROMPTS = [
  "What should I watch tonight?",
  "Show me what I've rated highly",
  "Find me a mind-bending sci-fi",
  "What's on my watchlist?",
  "Recommend a feel-good comedy",
  "Something like Inception but lighter",
];

const TOOL_LABELS = {
  search_movies:    'Searching films…',
  get_my_ratings:   'Reading your ratings…',
  get_my_watchlist: 'Checking your watchlist…',
  add_to_watchlist: 'Adding to watchlist…',
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SIDEBAR_W = 260; // px

export default function Chat() {
  // ── Chat state ────────────────────────────────────────────────────────────────
  const [messages, setMessages]             = useState([]);
  const [history, setHistory]               = useState([]);
  const [input, setInput]                   = useState('');
  const [isStreaming, setIsStreaming]        = useState(false);
  const [activeToolCall, setActiveToolCall] = useState(null);

  // ── Session state ─────────────────────────────────────────────────────────────
  const [sessionId, setSessionId]           = useState(null);
  const [sessions, setSessions]             = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // ── Sidebar state ─────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen]       = useState(false);   // mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // desktop collapse

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const navigate       = useNavigate();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeToolCall]);

  // ── Load sessions on mount ────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    try {
      const { data } = await getChatSessions();
      setSessions(data.data || []);
    } catch { /* silent */ }
    finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ── Load a past session ───────────────────────────────────────────────────────
  const loadSession = useCallback(async (id) => {
    setSidebarOpen(false);
    setSessionId(id);
    setMessages([]);
    setHistory([]);
    try {
      const { data } = await getChatMessages(id);
      const msgs = data.data || [];
      setMessages(msgs.map((m, i) => ({ id: i, role: m.role, content: m.content })));
      setHistory(msgs.map(m => ({ role: m.role, content: m.content })));
    } catch { /* silent */ }
    inputRef.current?.focus();
  }, []);

  // ── New conversation ──────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setHistory([]);
    setInput('');
    setSidebarOpen(false);
    inputRef.current?.focus();
  }, []);

  // ── Delete session ────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (e, id) => {
    e.stopPropagation();
    try {
      await deleteChatSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessionId === id) startNewChat();
    } catch { /* silent */ }
  }, [sessionId, startNewChat]);

  // ── Send message ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isStreaming) return;

    const userMsg = { id: Date.now(),     role: 'user',      content: text };
    const aiMsgId = Date.now() + 1;
    const aiMsg   = { id: aiMsgId,        role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput('');
    setIsStreaming(true);
    setActiveToolCall(null);

    // Create session on first message
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      try {
        const { data } = await createChatSession(text.trim().slice(0, 80));
        currentSessionId = data.session.id;
        setSessionId(currentSessionId);
        setSessions(prev => [data.session, ...prev]);
      } catch { /* non-fatal */ }
    }

    const token = localStorage.getItem('access_token');
    let fullText = '';

    try {
      const response = await fetch(`${API_BASE}/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }], history }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(part.slice(6));
            if (event.type === 'tool_call') {
              setActiveToolCall(TOOL_LABELS[event.tool] ?? `Using ${event.tool}…`);
            } else if (event.type === 'tool_result') {
              setActiveToolCall(null);
            } else if (event.type === 'text') {
              fullText += event.content;
              setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullText } : m));
            } else if (event.type === 'done') {
              setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, streaming: false } : m));
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch { /* ignore malformed SSE */ }
        }
      }

      setHistory(prev => [...prev,
        { role: 'user',      content: text },
        { role: 'assistant', content: fullText },
      ]);

      // Persist to DB
      if (currentSessionId && fullText) {
        try {
          await saveChatMessages(currentSessionId, [
            { role: 'user',      content: text },
            { role: 'assistant', content: fullText },
          ]);
          setSessions(prev => {
            const idx = prev.findIndex(s => s.id === currentSessionId);
            if (idx < 0) return prev;
            const updated = [...prev];
            const [s] = updated.splice(idx, 1);
            return [{ ...s, updated_at: new Date().toISOString(), last_message: fullText.slice(0, 80) }, ...updated];
          });
        } catch { /* non-fatal */ }
      }

    } catch {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, content: 'Something went wrong. Try again.', streaming: false } : m
      ));
    } finally {
      setIsStreaming(false);
      setActiveToolCall(null);
      inputRef.current?.focus();
    }
  }, [isStreaming, sessionId, history]);

  // ── Sidebar content ───────────────────────────────────────────────────────────
  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-r border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-sm bg-gold/10 border border-gold/20 flex items-center justify-center">
            <SparklesIcon className="w-3 h-3 text-gold" />
          </div>
          <span className="font-display text-sm font-semibold text-ink-primary tracking-wide">CineBot</span>
        </div>
        {/* Desktop collapse button */}
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="hidden lg:flex items-center justify-center w-6 h-6 rounded-sm text-ink-muted hover:text-ink-primary hover:bg-white/[0.05] transition-colors"
          title="Collapse sidebar"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
        {/* Mobile close button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden flex items-center justify-center w-6 h-6 rounded-sm text-ink-muted hover:text-ink-primary"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New Chat */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={startNewChat}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm border border-white/[0.08] text-ink-secondary hover:text-ink-primary hover:border-gold/25 hover:bg-white/[0.03] text-sm font-medium transition-colors"
        >
          <PlusIcon className="w-4 h-4 flex-shrink-0" />
          New conversation
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {sessionsLoading ? (
          <div className="space-y-1.5 mt-2 px-1">
            {[1,2,3].map(i => <div key={i} className="h-14 skeleton rounded-sm" />)}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-ink-muted text-xs text-center mt-10 px-4 leading-relaxed">
            No conversations yet.<br />Start one below.
          </p>
        ) : (
          <div className="space-y-0.5 mt-1">
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-sm flex items-start gap-2 group transition-colors ${
                  sessionId === s.id
                    ? 'bg-gold/[0.08] border border-gold/20'
                    : 'border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate leading-snug ${sessionId === s.id ? 'text-gold' : 'text-ink-secondary'}`}>
                    {s.title}
                  </p>
                  {s.last_message && (
                    <p className="text-ink-muted text-[10px] truncate mt-0.5">{s.last_message}</p>
                  )}
                  <p className="text-ink-muted text-[9px] mt-1">{timeAgo(s.updated_at || s.created_at)}</p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, s.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-400 transition-all mt-0.5 p-0.5"
                >
                  <TrashIcon className="w-3 h-3" />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── Layout offsets based on sidebar state ─────────────────────────────────────
  const desktopOffset = sidebarCollapsed ? '0px' : `${SIDEBAR_W}px`;

  return (
    <div className="h-screen overflow-hidden bg-void flex">

      {/* ── Desktop sidebar ── */}
      <AnimatePresence initial={false}>
        {!sidebarCollapsed && (
          <motion.div
            key="desktop-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: SIDEBAR_W, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 overflow-hidden"
            style={{ width: SIDEBAR_W }}
          >
            {SidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile sidebar drawer ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/60 z-40"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 z-50"
              style={{ width: SIDEBAR_W }}
            >
              {SidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Main chat area ── */}
      <motion.div
        className="flex-1 flex flex-col h-screen overflow-hidden"
        animate={{ marginLeft: desktopOffset }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      >

        {/* Header */}
        <motion.div
          className="fixed top-0 right-0 z-40 glass-dark border-b border-white/[0.06] px-5 py-4"
          animate={{ left: desktopOffset }}
          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-ink-muted hover:text-ink-primary transition-colors"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>

            {/* Desktop: collapsed sidebar expand button OR back button */}
            {sidebarCollapsed ? (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="hidden lg:flex items-center justify-center w-7 h-7 rounded-sm border border-white/[0.08] text-ink-muted hover:text-ink-primary hover:border-gold/25 transition-colors"
                title="Open sidebar"
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/')}
                className="hidden lg:flex text-ink-muted hover:text-ink-primary transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-sm bg-gold/10 border border-gold/20 flex items-center justify-center">
                <SparklesIcon className="w-4 h-4 text-gold" />
              </div>
              <span className="font-display text-xl font-semibold text-ink-primary">CineBot</span>
              <span className="text-[9px] font-sans font-semibold tracking-widest text-gold border border-gold/30 px-1.5 py-0.5 rounded-sm">AI</span>
            </div>
            <span className="text-ink-muted text-sm ml-1 hidden sm:block">Ask me anything about films & shows</span>
          </div>
        </motion.div>

        {/* Messages */}
        <div className="flex-1 pt-[72px] pb-28 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-10 space-y-7">

            {/* Empty state */}
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="text-center py-16"
              >
                <div className="w-16 h-16 mx-auto rounded-sm bg-gold/[0.08] border border-gold/15 flex items-center justify-center mb-6">
                  <FilmIcon className="w-7 h-7 text-gold" />
                </div>
                <h2 className="font-display text-4xl font-semibold text-ink-primary mb-3">
                  What do you want to watch?
                </h2>
                <p className="text-ink-secondary text-base mb-10 max-w-sm mx-auto leading-relaxed">
                  I can search films, check your ratings, and manage your watchlist.
                </p>
                <div className="flex flex-wrap gap-2.5 justify-center max-w-lg mx-auto">
                  {SUGGESTED_PROMPTS.map((p, i) => (
                    <motion.button
                      key={p}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.07, duration: 0.3 }}
                      whileHover={{ y: -2, borderColor: 'rgba(201,168,76,0.3)', color: 'var(--ink-primary)' }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => sendMessage(p)}
                      disabled={isStreaming}
                      className="glass border border-white/[0.08] text-ink-secondary text-sm px-4 py-2 rounded-sm transition-colors"
                    >
                      {p}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Message list */}
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.96, x: msg.role === 'user' ? 16 : -16 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <motion.div
                      className="w-8 h-8 rounded-sm bg-gold/[0.08] border border-gold/15 flex items-center justify-center flex-shrink-0 mr-3 mt-0.5"
                      animate={msg.streaming ? { borderColor: ['rgba(201,168,76,0.15)', 'rgba(201,168,76,0.5)', 'rgba(201,168,76,0.15)'] } : {}}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <SparklesIcon className="w-4 h-4 text-gold" />
                    </motion.div>
                  )}

                  <div className={`max-w-[78%] text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-white/[0.07] border border-white/[0.12] text-ink-primary px-4 py-3 rounded-sm rounded-br-none shadow-card'
                      : 'text-ink-secondary'
                  }`}>
                    {msg.content ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      msg.streaming && (
                        <div className="flex gap-1.5 items-center py-1">
                          {[0, 0.15, 0.3].map((delay, i) => (
                            <motion.span
                              key={i}
                              className="w-2 h-2 bg-gold/50 rounded-full"
                              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 0.8, delay, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          ))}
                        </div>
                      )
                    )}
                    {msg.streaming && msg.content && (
                      <motion.span
                        className="inline-block w-0.5 h-4 bg-gold/70 ml-0.5 align-middle"
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      />
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Tool call indicator */}
            <AnimatePresence>
              {activeToolCall && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex justify-start"
                >
                  <div className="ml-11 flex items-center gap-2.5 text-sm border border-gold/20 bg-gold/[0.04] text-gold/80 px-4 py-2 rounded-sm">
                    <motion.span
                      className="w-1.5 h-1.5 bg-gold rounded-full flex-shrink-0"
                      animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                    {activeToolCall}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input bar */}
        <motion.div
          className="fixed bottom-0 right-0 glass-dark border-t border-white/[0.06] px-5 py-4"
          animate={{ left: desktopOffset }}
          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input.trim()); }}
            className="max-w-3xl mx-auto flex gap-3 items-center"
          >
            <motion.input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about movies, your ratings, watchlist…"
              disabled={isStreaming}
              whileFocus={{ borderColor: 'rgba(201,168,76,0.45)', boxShadow: '0 0 0 1px rgba(201,168,76,0.15)' }}
              className="flex-1 bg-white/[0.04] border border-white/10 text-ink-primary placeholder-ink-muted rounded-sm px-4 py-3 text-sm focus:outline-none disabled:opacity-40 transition-colors"
            />
            <motion.button
              type="submit"
              disabled={!input.trim() || isStreaming}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              className="w-12 h-12 flex items-center justify-center bg-gold hover:bg-gold-light disabled:opacity-30 disabled:cursor-not-allowed text-void rounded-sm transition-colors flex-shrink-0 shadow-gold-sm"
            >
              <motion.div
                animate={isStreaming ? { rotate: 360 } : { rotate: 0 }}
                transition={isStreaming ? { duration: 1.5, repeat: Infinity, ease: 'linear' } : {}}
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </motion.div>
            </motion.button>
          </form>
        </motion.div>

      </motion.div>
    </div>
  );
}
