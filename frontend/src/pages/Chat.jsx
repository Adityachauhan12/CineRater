import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';

const API_BASE = 'http://127.0.0.1:8000/api';

const SUGGESTED_PROMPTS = [
    "What should I watch tonight?",
    "Show me what I've rated highly",
    "Find me a mind-bending sci-fi",
    "What's on my watchlist?",
    "Recommend a feel-good comedy",
    "Find something like Inception but lighter",
];

// Tool call display label map
const TOOL_LABELS = {
    search_movies: '🔍 Searching movies...',
    get_my_ratings: '⭐ Checking your ratings...',
    get_my_watchlist: '🔖 Loading your watchlist...',
    add_to_watchlist: '➕ Adding to watchlist...',
};

export default function Chat() {
    const [messages, setMessages] = useState([]);   // { id, role, content, toolCalls? }
    const [history, setHistory] = useState([]);     // flattened for API: [{role, content}]
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [activeToolCall, setActiveToolCall] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, activeToolCall]);

    const sendMessage = async (text) => {
        if (!text.trim() || isStreaming) return;

        const userMsg = { id: Date.now(), role: 'user', content: text };
        const aiMsgId = Date.now() + 1;

        setMessages(prev => [
            ...prev,
            userMsg,
            { id: aiMsgId, role: 'assistant', content: '', streaming: true },
        ]);
        setInput('');
        setIsStreaming(true);
        setActiveToolCall(null);

        const token = localStorage.getItem('access_token');
        let fullText = '';

        try {
            const response = await fetch(`${API_BASE}/chat/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: text }],
                    history,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

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
                            setActiveToolCall(TOOL_LABELS[event.tool] ?? `Using ${event.tool}...`);
                        } else if (event.type === 'tool_result') {
                            setActiveToolCall(null);
                        } else if (event.type === 'text') {
                            fullText += event.content;
                            setMessages(prev => prev.map(m =>
                                m.id === aiMsgId ? { ...m, content: fullText } : m
                            ));
                        } else if (event.type === 'done') {
                            setMessages(prev => prev.map(m =>
                                m.id === aiMsgId ? { ...m, streaming: false } : m
                            ));
                        } else if (event.type === 'error') {
                            throw new Error(event.message);
                        }
                    } catch (parseErr) {
                        // ignore malformed SSE lines
                    }
                }
            }

            // Update history for multi-turn context
            setHistory(prev => [
                ...prev,
                { role: 'user', content: text },
                { role: 'assistant', content: fullText },
            ]);

        } catch (err) {
            setMessages(prev => prev.map(m =>
                m.id === aiMsgId
                    ? { ...m, content: 'Something went wrong. Please try again.', streaming: false }
                    : m
            ));
        } finally {
            setIsStreaming(false);
            setActiveToolCall(null);
            inputRef.current?.focus();
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(input.trim());
    };

    const handleSuggest = (prompt) => {
        if (!isStreaming) sendMessage(prompt);
    };

    return (
        <div className="min-h-screen bg-[#141414] flex flex-col">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-40 bg-[#1a1a1a]/95 backdrop-blur border-b border-white/5 px-4 py-3">
                <div className="max-w-3xl mx-auto flex items-center gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
                    >
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">CineBot</span>
                        <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">AI</span>
                    </div>
                    <p className="text-gray-500 text-sm ml-1">Ask me anything about movies & shows</p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 pt-20 pb-28 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

                    {/* Empty state */}
                    {messages.length === 0 && (
                        <div className="text-center py-16">
                            <div className="text-6xl mb-4">🎬</div>
                            <h2 className="text-white text-2xl font-semibold mb-2">What do you want to watch?</h2>
                            <p className="text-gray-500 mb-10 text-sm">
                                I can search movies, check your ratings, and manage your watchlist.
                            </p>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {SUGGESTED_PROMPTS.map(p => (
                                    <button
                                        key={p}
                                        onClick={() => handleSuggest(p)}
                                        className="bg-[#2a2a2a] hover:bg-[#333] border border-white/5 text-gray-300 text-sm px-4 py-2 rounded-full transition-colors"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Chat messages */}
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'assistant' && (
                                <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-sm flex-shrink-0 mr-3 mt-0.5">
                                    🎬
                                </div>
                            )}
                            <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-red-600/20 border border-red-600/30 text-white rounded-br-sm'
                                    : 'bg-[#2a2a2a] border border-white/5 text-gray-100 rounded-bl-sm'
                            }`}>
                                {msg.content ? (
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                ) : (
                                    msg.streaming && (
                                        <div className="flex gap-1 items-center py-1">
                                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    )
                                )}
                                {msg.streaming && msg.content && (
                                    <span className="inline-block w-0.5 h-4 bg-red-400 animate-pulse ml-0.5 align-middle" />
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Active tool call indicator */}
                    {activeToolCall && (
                        <div className="flex justify-start">
                            <div className="ml-11 bg-[#222] border border-white/5 text-gray-400 text-xs px-3 py-2 rounded-xl italic flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                                {activeToolCall}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a]/95 backdrop-blur border-t border-white/5 px-4 py-4">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3 items-end">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Ask about movies, your ratings, watchlist…"
                        disabled={isStreaming}
                        className="flex-1 bg-[#2a2a2a] border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600/50 disabled:opacity-40 transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isStreaming}
                        className="bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors flex-shrink-0"
                    >
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
