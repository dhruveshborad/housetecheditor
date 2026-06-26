'use client';

import React, { useEffect, useState } from 'react';
import { X, Users, Plus, Trash2, Crown, Edit3, Eye, Loader2, Mail, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

interface ShareModalProps {
  documentId: string;
  onClose: () => void;
}

const ROLE_CONFIG = {
  OWNER: {
    label: 'Owner',
    icon: Crown,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
  },
  EDITOR: {
    label: 'Editor',
    icon: Edit3,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/30',
  },
  VIEWER: {
    label: 'Viewer',
    icon: Eye,
    color: 'text-neutral-400',
    bg: 'bg-neutral-500/10 border-neutral-500/30',
  },
};

export function ShareModal({ documentId, onClose }: ShareModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [isInviting, setIsInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [documentId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch(`/api/documents/${documentId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMsg(data.updated
          ? `Updated ${inviteEmail}'s role to ${inviteRole}`
          : `${inviteEmail} added as ${inviteRole}`
        );
        setInviteEmail('');
        fetchMembers();
      } else {
        setError(data.error || 'Failed to add member');
      }
    } catch (e) {
      setError('Network error. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    setError('');

    try {
      const res = await fetch(`/api/documents/${documentId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        setMembers(prev => prev.filter(m => m.user.id !== userId));
        setSuccessMsg('Member removed successfully');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove member');
      }
    } catch (e) {
      setError('Network error. Please try again.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="glass-panel w-full max-w-lg rounded-3xl border border-neutral-800 shadow-2xl shadow-black/50 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-900 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <Users className="h-4.5 w-4.5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-white text-sm truncate">Share Document</h2>
              <p className="text-xs text-neutral-500 mt-0.5 truncate">Manage collaborator access</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setSuccessMsg('Link copied to clipboard!');
                setTimeout(() => setSuccessMsg(''), 3000);
              }}
              className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors flex items-center gap-1.5"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Copy Link</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Invite Form */}
        <div className="p-6 border-b border-neutral-900">
          <form onSubmit={handleInvite} className="space-y-3">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
              Invite Collaborator
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'EDITOR' | 'VIEWER')}
                className="px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={isInviting}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5"
              >
                {isInviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Invite
              </button>
            </div>

            {/* Feedback Messages */}
            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}
            {successMsg && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
                {successMsg}
              </p>
            )}
          </form>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto p-6">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-3">
            {loading ? 'Loading members...' : `${members.length} ${members.length === 1 ? 'Member' : 'Members'}`}
          </label>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => {
                const roleConfig = ROLE_CONFIG[member.role];
                const RoleIcon = roleConfig.icon;

                return (
                  <div
                    key={member.id}
                    className="p-3.5 rounded-2xl bg-neutral-950/40 border border-neutral-900 flex items-center gap-3"
                  >
                    {/* Avatar */}
                    <div className="h-9 w-9 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0">
                      {member.user.name?.charAt(0)?.toUpperCase() || member.user.email?.charAt(0)?.toUpperCase() || '?'}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-neutral-200 truncate">
                        {member.user.name || 'Unknown User'}
                      </p>
                      <p className="text-[10px] text-neutral-500 truncate">{member.user.email}</p>
                    </div>

                    {/* Role Badge */}
                    <span className={cn(
                      "px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0",
                      roleConfig.bg, roleConfig.color
                    )}>
                      <RoleIcon className="h-2.5 w-2.5" />
                      {roleConfig.label}
                    </span>

                    {/* Remove button (only for non-owners) */}
                    {member.role !== 'OWNER' && (
                      <button
                        onClick={() => handleRemove(member.user.id)}
                        disabled={removingId === member.user.id}
                        title="Remove member"
                        className="p-1.5 rounded-lg text-neutral-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 disabled:opacity-50"
                      >
                        {removingId === member.user.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Role Legend */}
        <div className="p-4 border-t border-neutral-900">
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(ROLE_CONFIG).map(([role, config]) => {
              const Icon = config.icon;
              return (
                <div key={role} className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-semibold", config.bg, config.color)}>
                  <Icon className="h-3 w-3" />
                  <div>
                    <div>{config.label}</div>
                    <div className="text-[9px] opacity-60 font-normal">
                      {role === 'OWNER' ? 'Full control' : role === 'EDITOR' ? 'Can edit' : 'Read only'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Click outside to close */}
        <div className="absolute inset-0 -z-10" onClick={onClose} />
      </div>
    </div>
  );
}