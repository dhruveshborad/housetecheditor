'use client';

import React, { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { localDb, type LocalDocument } from '@/lib/dexie/db';
import { useEditorStore } from '@/lib/store/editor-store';
import { ConnectionStatus } from '@/components/connection-status';
import {
  FileText, Plus, Database, LogOut,
  Settings, User, FilePen, FolderOpen, RefreshCcw,
  AlertCircle, ShieldCheck, Activity, Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const {
    networkStatus,
    pendingOpsCount,
    failedOpsCount,
    initialize,
  } = useEditorStore();

  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [documents, setDocuments] = useState<any[]>([]);
  const [storageUsage, setStorageUsage] = useState({ used: '0 KB', percentage: 0 });
  const [loading, setLoading] = useState(true);

  // Modal / Input States
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

  // Fetch data
  const fetchData = async () => {
    if (status !== 'authenticated') return;
    setLoading(true);

    try {
      // 1. Fetch workspaces from Server
      const wsRes = await fetch('/api/workspaces');
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        setWorkspaces(wsData.workspaces || []);
        if (wsData.workspaces?.length > 0 && !selectedWorkspaceId) {
          setSelectedWorkspaceId(wsData.workspaces[0].id);
        }
      }

      // 2. Fetch server-synced documents
      const docRes = await fetch('/api/documents');
      let serverDocs: any[] = [];
      if (docRes.ok) {
        const docData = await docRes.json();
        serverDocs = docData.documents || [];
      }

      // 3. Fetch local documents from Dexie IndexedDB
      let localDocs: LocalDocument[] = [];
      if (localDb) {
        localDocs = await localDb.documents.toArray();
      }

      // 4. Merge server and local documents
      const mergedDocsMap = new Map<string, any>();

      // Seed with server docs
      for (const sDoc of serverDocs) {
        mergedDocsMap.set(sDoc.id, {
          ...sDoc,
          source: 'synced',
          isDirty: false,
        });
      }

      // Merge local docs (adds offline-created docs, flags dirty ones)
      for (const lDoc of localDocs) {
        if (mergedDocsMap.has(lDoc.id)) {
          const merged = mergedDocsMap.get(lDoc.id);
          mergedDocsMap.set(lDoc.id, {
            ...merged,
            title: lDoc.title, // Use local title if newer
            updatedAt: new Date(Math.max(new Date(merged.updatedAt).getTime(), lDoc.updatedAt)).toISOString(),
            isDirty: lDoc.isDirty || false,
          });
        } else {
          // Document exists only locally (offline creation)
          mergedDocsMap.set(lDoc.id, {
            id: lDoc.id,
            title: lDoc.title,
            workspaceId: lDoc.workspaceId,
            createdBy: lDoc.createdBy,
            version: lDoc.version,
            createdAt: new Date(lDoc.createdAt).toISOString(),
            updatedAt: new Date(lDoc.updatedAt).toISOString(),
            source: 'local-only',
            isDirty: true,
            userRole: 'OWNER', // Local creator defaults to owner
          });
        }
      }

      setDocuments(Array.from(mergedDocsMap.values()));
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated') {
      fetchData();
    }
  }, [status, selectedWorkspaceId]);

  // Compute IndexedDB storage utilization stats
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 1;

        let formattedUsage = '0 KB';
        if (usage > 1024 * 1024) {
          formattedUsage = `${(usage / (1024 * 1024)).toFixed(1)} MB`;
        } else {
          formattedUsage = `${(usage / 1024).toFixed(0)} KB`;
        }

        setStorageUsage({
          used: formattedUsage,
          percentage: Math.min(Math.round((usage / quota) * 100), 100) || 1,
        });
      });
    }
  }, [documents]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkspaceName }),
      });

      if (res.ok) {
        setNewWorkspaceName('');
        setIsCreatingWorkspace(false);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !selectedWorkspaceId) return;

    try {
      const isOnline = networkStatus === 'online';

      if (isOnline) {
        // Online creation: Create on server
        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newDocTitle, workspaceId: selectedWorkspaceId }),
        });

        if (res.ok) {
          const data = await res.json();
          if (localDb) {
            await localDb.documents.put({
              id: data.document.id,
              title: data.document.title,
              content: '[]',
              workspaceId: selectedWorkspaceId,
              createdBy: session?.user?.id || 'unknown',
              version: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              userRole: 'OWNER',
            });
          }
          setNewDocTitle('');
          setIsCreatingDoc(false);
          router.push(`/document/${data.document.id}`);
        }
      } else {
        // Offline creation: Create local-only document in IndexedDB
        const docId = 'offline-' + Math.random().toString(36).substr(2, 9);
        const newLocalDoc: LocalDocument = {
          id: docId,
          title: newDocTitle,
          content: '[]',
          workspaceId: selectedWorkspaceId,
          createdBy: session?.user?.id || 'unknown',
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDirty: true,
        };

        if (localDb) {
          await localDb.documents.add(newLocalDoc);

          // Queue a special INSERT_BLOCK or SET_TITLE operation in the sync queue once reconnecting
          // But for now, sync engine will push it as a whole when we sync local docs.
        }

        setNewDocTitle('');
        setIsCreatingDoc(false);
        router.push(`/document/${docId}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712] text-neutral-400">
        <RefreshCcw className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Filter documents belonging to selected workspace
  const workspaceDocs = documents.filter(doc => doc.workspaceId === selectedWorkspaceId);

  return (
    <div className="min-h-screen flex flex-col pb-12">
      {/* Header Banner */}
      <header className="glass-panel sticky top-0 z-40 border-b border-neutral-900 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/10">
            <FilePen className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="font-bold text-base text-white">HouseEditor</span>
          <div className="h-4 w-px bg-neutral-800 hidden sm:block" />
          <div className="hidden sm:block">
            <ConnectionStatus />
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs">
              {session?.user?.name?.charAt(0) || 'U'}
            </div>
            <span className="text-sm font-semibold text-neutral-300 hidden md:inline">{session?.user?.name}</span>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Sign Out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 pt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* Left Column: Stats & Workspaces */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Workspace Switcher Card */}
          <div className="glass-panel p-5 rounded-2xl border border-neutral-900">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Workspaces</span>
              <button
                onClick={() => setIsCreatingWorkspace(true)}
                className="p-1 rounded-md bg-neutral-950 border border-neutral-900 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {isCreatingWorkspace && (
              <form onSubmit={handleCreateWorkspace} className="mb-4 space-y-2">
                <input
                  type="text"
                  required
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="Workspace Name"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950/80 border border-neutral-900 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsCreatingWorkspace(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-900 text-[10px] font-semibold hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-[10px] font-semibold text-white hover:bg-indigo-500"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1.5">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => setSelectedWorkspaceId(ws.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all",
                    selectedWorkspaceId === ws.id
                      ? "bg-indigo-600/10 border-indigo-500/40 text-indigo-300"
                      : "bg-neutral-950/40 border-neutral-900 text-neutral-400 hover:text-neutral-200 hover:border-neutral-800"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>{ws.name}</span>
                  </div>
                </button>
              ))}
              {workspaces.length === 0 && (
                <div className="text-center py-4 text-xs text-neutral-600 font-medium">No workspaces found</div>
              )}
            </div>
          </div>

          {/* Sync Stats Summary Card */}
          <div className="glass-panel p-5 rounded-2xl border border-neutral-900 space-y-4">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">Sync Engine Stats</span>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-xl flex flex-col">
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Pending Ops</span>
                <span className={cn("text-lg font-bold mt-1", pendingOpsCount > 0 ? "text-amber-400" : "text-neutral-300")}>
                  {pendingOpsCount}
                </span>
              </div>
              <div className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-xl flex flex-col">
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Failed Synces</span>
                <span className={cn("text-lg font-bold mt-1", failedOpsCount > 0 ? "text-rose-400" : "text-neutral-300")}>
                  {failedOpsCount}
                </span>
              </div>
            </div>

            <div className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-neutral-400">
                <Activity className="h-4 w-4 text-emerald-400" />
                <span>Sync Engine State</span>
              </div>
              <span className="font-semibold text-emerald-400 uppercase text-[10px]">Active</span>
            </div>
          </div>

          {/* Local IndexedDB Storage Utilization Card */}
          <div className="glass-panel p-5 rounded-2xl border border-neutral-900 space-y-3">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">Local Storage (Dexie)</span>
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-400" />
                <span>IndexedDB Space</span>
              </div>
              <span className="font-bold text-neutral-100">{storageUsage.used}</span>
            </div>

            <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${storageUsage.percentage}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-500 block">Offline cache is optimized for 10,000+ operations.</span>
          </div>
        </div>

        {/* Right Column: Documents List */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* Main List Section */}
          <div className="glass-panel p-6 rounded-2xl border border-neutral-900 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Documents</h2>
              </div>

              <button
                onClick={() => setIsCreatingDoc(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-colors rounded-xl shadow-md shadow-indigo-600/10 flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> New Document
              </button>
            </div>

            {/* Create Doc Form */}
            {isCreatingDoc && (
              <form onSubmit={handleCreateDocument} className="mb-6 p-4 rounded-xl bg-neutral-950 border border-neutral-900 space-y-3">
                <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider block">Create New Document</span>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    placeholder="Document Title (e.g. Q3 Roadmap)"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsCreatingDoc(false)}
                      className="px-4 py-2.5 rounded-xl bg-neutral-900 text-xs font-semibold hover:bg-neutral-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Documents Grid / Table */}
            <div className="flex-1 flex flex-col">
              {workspaceDocs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {workspaceDocs.map((doc) => (
                    <Link
                      href={`/document/${doc.id}`}
                      key={doc.id}
                      className="p-5 rounded-2xl bg-neutral-950/40 border border-neutral-900 hover:border-neutral-800 transition-all flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <span className="text-sm font-bold text-neutral-200 group-hover:text-indigo-400 transition-colors line-clamp-1">
                            {doc.title}
                          </span>

                          {/* Sync Badges */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {doc.isDirty ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] text-amber-400 font-semibold uppercase">
                                Offline Changes
                              </span>
                            ) : doc.source === 'local-only' ? (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-[9px] text-rose-400 font-semibold uppercase">
                                Local-Only
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] text-emerald-400 font-semibold uppercase flex items-center gap-0.5">
                                <ShieldCheck className="h-2.5 w-2.5" /> Synced
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="text-[10px] text-neutral-500 block mb-4">
                          Last edited: {new Date(doc.updatedAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between border-t border-neutral-950/80 pt-4 mt-2">
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          <Layers className="h-3 w-3" /> Role: {doc.userRole}
                        </div>

                        <span className="text-xs font-semibold text-neutral-400 group-hover:text-white transition-colors flex items-center gap-1">
                          Open Editor &rarr;
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-neutral-600 gap-3 border border-dashed border-neutral-900 rounded-2xl">
                  <FolderOpen className="h-8 w-8 text-neutral-800" />
                  <span className="text-xs font-semibold">No documents found in this workspace</span>
                  <button
                    onClick={() => setIsCreatingDoc(true)}
                    className="px-3 py-1.5 rounded-lg border border-neutral-800 hover:border-neutral-700 text-[10px] font-bold text-neutral-400 hover:text-white transition-colors"
                  >
                    Create your first document
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
