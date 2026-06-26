import Link from 'next/link';
import { ArrowRight, Cloud, Shield, Zap, History, Network, Compass, Sparkles } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-neutral-900 px-4 py-3 md:px-6 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <Sparkles className="h-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <span className="font-bold text-base sm:text-lg tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
            HouseEditor
          </span>
          <span className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-semibold tracking-wider uppercase">
            SyncForge
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-neutral-400 font-medium">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
          <a href="#security" className="hover:text-white transition-colors">Security</a>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link href="/auth/login" className="text-xs sm:text-sm font-semibold text-neutral-300 hover:text-white transition-colors px-2.5 py-2">
            Sign In
          </Link>
          <Link
            href="/auth/register"
            className="text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Get Started</span> <ArrowRight className="h-3.5 sm:h-4 sm:w-4" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 pt-32 pb-16 px-6 max-w-7xl mx-auto flex flex-col items-center text-center justify-center min-h-[90vh]">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-neutral-400 font-medium mb-8 animate-float">
          <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          Offline-First Collaboration Protocol
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-[1.1] mb-6">
          Collaborative Editing,{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
            Without Network Latency.
          </span>
        </h1>

        <p className="text-neutral-400 text-lg sm:text-xl max-w-2xl mb-10 leading-relaxed">
          SyncForge blends local-first speed with real-time sync. Type instantly offline, resolve conflicts deterministically, and view version timelines flawlessly.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20 w-full max-w-md">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 transition-all px-8 py-4 rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 group"
          >
            Launch Application
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto text-sm font-bold text-neutral-300 hover:text-white glass-panel border border-neutral-800 hover:border-neutral-700 transition-all px-8 py-4 rounded-2xl flex items-center justify-center"
          >
            Explore Features
          </a>
        </div>

        {/* Feature Cards Grid */}
        <section id="features" className="w-full pt-16 border-t border-neutral-900">
          <h2 className="text-2xl sm:text-4xl font-bold mb-4 text-white">
            Designed for Instant Productivity
          </h2>
          <p className="text-neutral-500 max-w-xl mx-auto mb-16 text-sm">
            Powered by IndexedDB local caching, Lamport conflict resolution, and background sync queues.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="glass-panel p-8 rounded-2xl border border-neutral-900 hover:border-indigo-500/20 transition-all duration-300 group">
              <div className="h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                <Cloud className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Offline-First Engine</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Edits save to local IndexedDB instantly. Keep writing without network, and background tasks will sync automatically once online.
              </p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-neutral-900 hover:border-indigo-500/20 transition-all duration-300 group">
              <div className="h-12 w-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-6 text-violet-400 group-hover:bg-violet-500 group-hover:text-white transition-all">
                <Network className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Lamport Conflict Resolution</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Deterministic conflict resolution based on Lamport clocks. Merges edits sequentially without overwriting anyone&apos;s work.
              </p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-neutral-900 hover:border-indigo-500/20 transition-all duration-300 group">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-all">
                <History className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Audit Version History</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Take Git-inspired snapshots of document states, review past version timelines, and restore snapshots safely by appending history.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="glass-panel border-t border-neutral-900 py-8 px-6 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-neutral-400">HouseEditor (SyncForge)</span>
          </div>

          <div className="flex items-center gap-6">
            <span>Developer: <strong>Dhruvesh Borad</strong></span>
            <a href="https://github.com/dhruveshborad" target="_blank" rel="noreferrer" className="hover:text-neutral-300 transition-colors">GitHub Profile</a>
            <a href="https://www.linkedin.com/in/dhruveshkumar-borad" target="_blank" rel="noreferrer" className="hover:text-neutral-300 transition-colors">LinkedIn Profile</a>
            <a href="https://github.com/dhruveshborad/housetecheditor" target="_blank" rel="noreferrer" className="hover:text-neutral-300 transition-colors">Repository Link</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
