'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { useEditorStore } from '@/lib/store/editor-store';
import { syncEngine } from '@/lib/sync/sync-engine';
import { socketClient } from '@/lib/socket/socket-client';
import { Editor } from '@/components/editor';
import { ConnectionStatus } from '@/components/connection-status';
import { ShareModal } from '@/components/share-modal';
import { AIAssistant } from '@/components/ai-assistant';
import {
  ArrowLeft, History, Plus, Clock, FilePen,
  Users, X, ChevronRight, Loader2, Share2
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const documentId = params.id as string;

  const {
    currentDocument,
    blocks,
    activeCollaborators,
    createVersion,
    editTitle,
    accessDenied,
  } = useEditorStore();

  const [titleInput, setTitleInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotSummary, setSnapshotSummary] = useState('');
  const [previewingSnapshot, setPreviewingSnapshot] = useState<any | null>(null);

  // Initialize and run sync engine
  useEffect(() => {
    syncEngine.start();
    return () => {
      syncEngine.stop();
    };
  }, []);

  // Sync Socket.IO collaboration
  useEffect(() => {
    if (status === 'authenticated' && session?.user && documentId) {
      socketClient.connect(documentId, {
        id: session.user.id!,
        name: session.user.name || 'Anonymous',
        email: session.user.email || '',
        image: session.user.image,
      });
    }

    return () => {
      socketClient.disconnect();
    };
  }, [status, session, documentId]);

  // Bind title input when document loads
  useEffect(() => {
    if (currentDocument) {
      setTitleInput(currentDocument.title);
    }
  }, [currentDocument]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitleInput(val);
    editTitle(val); // Optimistic title update
  };

  // Fetch versions history
  const fetchVersions = async () => {
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/versions?documentId=${documentId}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    if (sidebarOpen) {
      fetchVersions();
    }
  }, [sidebarOpen]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;
    setIsCreatingSnapshot(true);

    try {
      const summary = snapshotSummary.trim() || 'Manual Snapshot';

      // Save locally
      await createVersion(session.user.id, summary);

      // Save to server
      const res = await fetch('/api/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          snapshot: JSON.stringify(blocks),
          changeSummary: summary,
        }),
      });

      if (res.ok) {
        setSnapshotSummary('');
        fetchVersions();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!confirm('Are you sure you want to restore this version? This will generate history-safe merge operations.')) {
      return;
    }

    try {
      const res = await fetch('/api/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          versionId,
        }),
      });

      if (res.ok) {
        setPreviewingSnapshot(null);
        setSidebarOpen(false);
        // Refresh local store content by reloading document
        useEditorStore.getState().loadDocument(documentId);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to restore version. Only document OWNERs can restore.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712] text-neutral-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712] p-6">
        <div className="max-w-md w-full glass-panel border border-neutral-800 rounded-3xl p-8 text-center flex flex-col items-center">
          <div className="h-16 w-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mb-6">
            <X className="h-8 w-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-neutral-400 mb-8">
            You don't have permission to view this document or it doesn't exist. Please ask the owner to invite you.
          </p>
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm text-white transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const userRole = currentDocument?.userRole || 'OWNER';

  return (
    <div className="min-h-screen flex flex-col pb-12 relative overflow-x-hidden">
      {/* Background glow effects */}
      <div className="absolute top-10 left-10 h-96 w-96 rounded-full bg-indigo-500/5 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 h-96 w-96 rounded-full bg-purple-500/5 blur-[150px] pointer-events-none" />

      {/* Header Banner */}
      <header className="glass-panel sticky top-0 z-40 border-b border-neutral-900 px-3 py-2.5 sm:px-6 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          <Link
            href="/dashboard"
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <input
            type="text"
            value={titleInput}
            onChange={handleTitleChange}
            disabled={userRole === 'VIEWER'}
            placeholder="Document Title"
            className="bg-transparent text-sm sm:text-base md:text-lg font-bold text-white border-b border-transparent hover:border-neutral-800 focus:border-indigo-500 focus:outline-none transition-colors px-1 py-0.5 max-w-[100px] min-[360px]:max-w-[130px] min-[400px]:max-w-[160px] sm:max-w-xs md:max-w-md w-full min-w-0"
          />

          {userRole === 'VIEWER' && (
            <span className="px-1.5 py-0.5 rounded-full bg-neutral-950 border border-neutral-800 text-[9px] sm:text-[10px] text-neutral-400 font-bold uppercase tracking-wider shrink-0">
              <span className="hidden sm:inline">Viewer Only</span>
              <span className="sm:hidden">Viewer</span>
            </span>
          )}
        </div>

        {/* Collaboration Area */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Active Collaborators presence bar */}
          <div className="flex items-center gap-1.5">
            {activeCollaborators.slice(0, 4).map((c, index) => (
              <div
                key={c.userId}
                title={`${c.name} (${c.email})`}
                className={cn(
                  "h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center border font-bold text-[10px] sm:text-xs uppercase relative select-none shrink-0",
                  index >= 2 && "hidden sm:flex"
                )}
                style={{
                  backgroundColor: `${c.color}20`,
                  borderColor: c.color,
                  color: c.color
                }}
              >
                {c.name.charAt(0)}
                {c.typing && (
                  <span className="absolute bottom-0 right-0 h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-emerald-500 border border-neutral-950 animate-pulse" />
                )}
              </div>
            ))}
            {activeCollaborators.length > 2 && (
              <span className="text-[10px] text-neutral-500 font-semibold sm:hidden">+{activeCollaborators.length - 2}</span>
            )}
            {activeCollaborators.length > 4 && (
              <span className="text-[10px] text-neutral-500 font-semibold hidden sm:inline">+{activeCollaborators.length - 4}</span>
            )}
          </div>

          <div className="h-4 w-px bg-neutral-800 hidden sm:block" />

          <div className="hidden sm:block">
            <ConnectionStatus />
          </div>

          {/* AI Assistant Toggle */}
          <button
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            title="AI Writing Assistant"
            className={cn(
              "p-2 sm:p-2.5 rounded-lg sm:rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold",
              aiPanelOpen
                ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
            )}
          >
            <FilePen className="h-4 w-4" />
            <span className="hidden md:inline">AI</span>
          </button>

          {/* Share button — owners can invite */}
          {userRole === 'OWNER' && (
            <button
              onClick={() => setShareModalOpen(true)}
              className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white hover:border-neutral-700 transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden md:inline">Share</span>
            </button>
          )}

          {/* Version History Toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              "p-2 sm:p-2.5 rounded-lg sm:rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold",
              sidebarOpen
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
            )}
          >
            <History className="h-4 w-4" />
            <span className="hidden md:inline">History</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-6 pt-8 flex flex-col lg:flex-row gap-6 relative">
        {/* Left Side: Editor Area */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          {/* Render editor */}
          <div className="flex-1">
            <Editor documentId={documentId} />
          </div>
        </div>

        {/* AI Assistant Panel */}
        {aiPanelOpen && (
          <AIAssistant
            blocks={blocks}
            onClose={() => setAiPanelOpen(false)}
          />
        )}
      </div>

      {/* Share Modal */}
      {shareModalOpen && (
        <ShareModal
          documentId={documentId}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </div>
  );
}
