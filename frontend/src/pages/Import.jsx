import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  XMarkIcon,
  StarIcon,
  BookmarkIcon,
} from '@heroicons/react/24/outline';
import { importFromImdb } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ─── File Drop Zone ────────────────────────────────────────────────────────────

const DropZone = ({ label, icon: Icon, file, onFile, accept = '.csv' }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.csv')) onFile(f);
    else toast.error('Please drop a .csv file');
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-sm border transition-all duration-200 cursor-pointer ${
        file
          ? 'border-gold/40 bg-gold/[0.04]'
          : dragging
          ? 'border-gold/60 bg-gold/[0.06]'
          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }}
      />

      <AnimatePresence mode="wait">
        {file ? (
          <motion.div
            key="file"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-2"
          >
            <CheckCircleIcon className="w-8 h-8 text-gold" />
            <p className="text-ink-primary text-sm font-medium text-center truncate max-w-[180px]">{file.name}</p>
            <p className="text-ink-muted text-xs">{(file.size / 1024).toFixed(0)} KB</p>
            <button
              onClick={(e) => { e.stopPropagation(); onFile(null); }}
              className="text-[11px] text-ink-muted hover:text-ink-secondary mt-1 flex items-center gap-1"
            >
              <XMarkIcon className="w-3 h-3" /> Remove
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-2"
          >
            <Icon className="w-8 h-8 text-ink-muted" />
            <p className="text-ink-primary text-sm font-medium">{label}</p>
            <p className="text-ink-muted text-xs text-center">Drop CSV here or click to browse</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Result Card ───────────────────────────────────────────────────────────────

const ResultCard = ({ result, importType }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="p-5 glass rounded-sm"
  >
    <div className="flex items-center gap-2 mb-4">
      <CheckCircleIcon className="w-5 h-5 text-gold" />
      <span className="text-ink-primary font-medium text-sm">Import complete</span>
    </div>

    <div className="grid grid-cols-3 gap-3 mb-4">
      {[
        { label: 'Imported', value: result.imported, accent: true },
        { label: 'Already existed', value: result.duplicates },
        { label: 'Not on TMDB', value: result.not_found },
      ].map(({ label, value, accent }) => (
        <div key={label} className={`p-3 rounded-sm text-center ${accent ? 'bg-gold/[0.08] border border-gold/20' : 'bg-white/[0.03] border border-white/[0.06]'}`}>
          <p className={`text-2xl font-display font-semibold ${accent ? 'text-gold' : 'text-ink-primary'}`}>{value}</p>
          <p className="text-ink-muted text-[11px] mt-0.5">{label}</p>
        </div>
      ))}
    </div>

    <p className="text-ink-muted text-xs text-center">{result.message}</p>

    {result.not_found > 0 && (
      <p className="text-ink-muted text-[11px] text-center mt-2 italic">
        Items not found are usually anime, shorts, or content TMDB doesn't index.
      </p>
    )}
  </motion.div>
);

// ─── Page ──────────────────────────────────────────────────────────────────────

const Import = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [ratingsFile, setRatingsFile] = useState(null);
  const [watchlistFile, setWatchlistFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeImport, setActiveImport] = useState(null); // 'ratings' | 'watchlist'
  const [results, setResults] = useState({ ratings: null, watchlist: null });

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const runImport = async (importType) => {
    const file = importType === 'ratings' ? ratingsFile : watchlistFile;
    if (!file) { toast.error('Select a CSV file first.'); return; }

    setLoading(true);
    setActiveImport(importType);
    try {
      const { data } = await importFromImdb(file, importType);
      setResults((prev) => ({ ...prev, [importType]: data }));
      toast.success(`Imported ${data.imported} ${importType === 'ratings' ? 'ratings' : 'watchlist items'}!`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Import failed. Check your CSV file.');
    } finally {
      setLoading(false);
      setActiveImport(null);
    }
  };

  return (
    <div className="min-h-screen bg-void pt-28 px-6 md:px-10 pb-20">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <span className="section-label mb-3 block">Data portability</span>
          <h1 className="font-display text-5xl font-semibold text-ink-primary tracking-tight">
            Import from IMDB
          </h1>
          <p className="text-ink-muted text-sm mt-3 max-w-sm leading-relaxed">
            Bring your IMDB ratings and watchlist into CineRater. Scores are converted from
            the 1–10 scale automatically.
          </p>
          <div className="mt-6 h-px bg-gradient-to-r from-gold/20 via-gold/5 to-transparent" />
        </motion.div>

        {/* How to export — instructions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-8 p-4 glass rounded-sm border border-white/[0.06]"
        >
          <p className="text-ink-secondary text-xs font-medium mb-2 uppercase tracking-widest">How to export from IMDB</p>
          <ol className="text-ink-muted text-xs space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Go to <span className="text-ink-secondary">imdb.com</span> → Your account → Your ratings (or Watchlist)</li>
            <li>Click the <span className="text-ink-secondary">⋮ menu</span> → <span className="text-ink-secondary">Export</span></li>
            <li>A <span className="text-ink-secondary">.csv</span> file will download — upload it below</li>
          </ol>
        </motion.div>

        {/* Ratings Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <StarIcon className="w-4 h-4 text-gold" />
            <h2 className="text-ink-primary text-sm font-semibold">Ratings</h2>
            <span className="text-ink-muted text-xs ml-auto">IMDB 1–10 → CineRater 0.5–5.0</span>
          </div>

          <DropZone
            label="ratings.csv"
            icon={DocumentTextIcon}
            file={ratingsFile}
            onFile={setRatingsFile}
          />

          <AnimatePresence>
            {results.ratings && <div className="mt-4"><ResultCard result={results.ratings} importType="ratings" /></div>}
          </AnimatePresence>

          <button
            onClick={() => runImport('ratings')}
            disabled={!ratingsFile || loading}
            className={`mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-sm text-sm font-medium transition-all ${
              ratingsFile && !loading
                ? 'btn-gold'
                : 'bg-white/[0.04] text-ink-muted cursor-not-allowed border border-white/[0.06]'
            }`}
          >
            {activeImport === 'ratings' ? (
              <><span className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" /> Importing…</>
            ) : (
              <><ArrowUpTrayIcon className="w-4 h-4" /> Import Ratings</>
            )}
          </button>
        </motion.div>

        <div className="relative my-8">
          <div className="h-px bg-white/[0.06]" />
          <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-void px-3 text-ink-muted text-xs">or</span>
        </div>

        {/* Watchlist Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <BookmarkIcon className="w-4 h-4 text-gold" />
            <h2 className="text-ink-primary text-sm font-semibold">Watchlist</h2>
          </div>

          <DropZone
            label="watchlist.csv"
            icon={DocumentTextIcon}
            file={watchlistFile}
            onFile={setWatchlistFile}
          />

          <AnimatePresence>
            {results.watchlist && <div className="mt-4"><ResultCard result={results.watchlist} importType="watchlist" /></div>}
          </AnimatePresence>

          <button
            onClick={() => runImport('watchlist')}
            disabled={!watchlistFile || loading}
            className={`mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-sm text-sm font-medium transition-all ${
              watchlistFile && !loading
                ? 'btn-gold'
                : 'bg-white/[0.04] text-ink-muted cursor-not-allowed border border-white/[0.06]'
            }`}
          >
            {activeImport === 'watchlist' ? (
              <><span className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" /> Importing…</>
            ) : (
              <><ArrowUpTrayIcon className="w-4 h-4" /> Import Watchlist</>
            )}
          </button>
        </motion.div>

        {/* Footer note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-start gap-2 p-3 rounded-sm bg-white/[0.02] border border-white/[0.05]"
        >
          <ExclamationCircleIcon className="w-4 h-4 text-ink-muted flex-shrink-0 mt-0.5" />
          <p className="text-ink-muted text-xs leading-relaxed">
            Importing won't overwrite existing CineRater ratings — duplicates are skipped.
            Items that can't be matched on TMDB (anime, shorts, etc.) are ignored.
          </p>
        </motion.div>

      </div>
    </div>
  );
};

export default Import;
