'use client';

import React, { useState } from 'react';
import { FilePen, X, Loader2, Copy, Check, RotateCcw, Wand2, BookOpen, PenLine, SpellCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Block } from '@/lib/conflict/merge';

interface AIAssistantProps {
  blocks: Block[];
  onClose: () => void;
}

type AIAction = 'summarize' | 'improve' | 'suggest' | 'grammar';

interface AIActionConfig {
  id: AIAction;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  border: string;
  activeClass: string;
}

const AI_ACTIONS: AIActionConfig[] = [
  {
    id: 'summarize',
    label: 'Summarize',
    description: 'Get a concise summary of the document',
    icon: BookOpen,
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    activeClass: 'bg-blue-500/10 border-blue-500/40',
  },
  {
    id: 'improve',
    label: 'Improve Style',
    description: 'Enhance clarity and readability',
    icon: Wand2,
    color: 'text-indigo-400',
    border: 'border-indigo-500/30',
    activeClass: 'bg-indigo-500/10 border-indigo-500/40',
  },
  {
    id: 'grammar',
    label: 'Fix Grammar',
    description: 'Correct grammar and spelling',
    icon: SpellCheck,
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    activeClass: 'bg-emerald-500/10 border-emerald-500/40',
  },
];

/**
 * Converts block array to plain text for AI processing.
 */
function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      try {
        const contentArr = JSON.parse(block.content || '[]');
        const extractText = (nodes: any[]): string =>
          nodes.map((node) => {
            if (node.type === 'text') return node.text || '';
            if (node.content) return extractText(node.content);
            return '';
          }).join('');
        return extractText(contentArr);
      } catch {
        return block.content || '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
}

export function AIAssistant({ blocks, onClose }: AIAssistantProps) {
  const [selectedAction, setSelectedAction] = useState<AIAction>('summarize');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleRunAI = async () => {
    setLoading(true);
    setError('');
    setResult('');

    const content = blocksToPlainText(blocks);

    if (!content.trim()) {
      setError('The document is empty. Start writing first!');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: selectedAction,
          content: content.slice(0, 40000), // Safety trim
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult(data.result);
      } else if (res.status === 503) {
        setError('AI service not configured. Please add GEMINI_API_KEY to your environment.');
      } else if (res.status === 429) {
        setError('Rate limit reached. Please wait a moment before trying again.');
      } else {
        setError(data.error || 'AI request failed. Please try again.');
      }
    } catch (e) {
      setError('Could not reach AI service. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setResult('');
    setError('');
  };

  const currentAction = AI_ACTIONS.find((a) => a.id === selectedAction)!;
  const ActionIcon = currentAction.icon;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        onClick={onClose}
      />
      <aside className={cn(
        "flex flex-col border border-neutral-900 shadow-2xl z-50 overflow-hidden",
        "bg-neutral-950/95 lg:glass-panel",
        "fixed inset-4 rounded-3xl md:inset-x-20 md:inset-y-10 lg:w-80 lg:h-[80vh] lg:sticky lg:top-28 lg:inset-auto lg:shrink-0 lg:z-20"
      )}>
        {loading ? (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center h-full">
            <div className="relative shrink-0 mb-4">
              <div className="h-14 w-14 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <FilePen className="h-7 w-7 text-purple-400 animate-pulse" />
              </div>
              <Loader2 className="absolute -inset-1.5 h-[68px] w-[68px] animate-spin text-purple-500/30" />
            </div>
            <p className="text-sm font-bold text-neutral-400 animate-pulse">Gemini is thinking...</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-5 border-b border-neutral-900 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center">
                  <FilePen className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">AI Assistant</h3>
                  <p className="text-[10px] text-neutral-500">Powered by Gemini</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-neutral-950 border border-neutral-900 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Action Selector */}
            <div className="p-4 border-b border-neutral-900 space-y-2">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Choose Action</span>
              <div className="grid grid-cols-2 gap-2">
                {AI_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  const isSelected = selectedAction === action.id;
                  return (
                    <button
                      key={action.id}
                      onClick={() => {
                        setSelectedAction(action.id);
                        setResult('');
                        setError('');
                      }}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-all group',
                        isSelected
                          ? action.activeClass
                          : 'bg-neutral-950/40 border-neutral-900 hover:border-neutral-800'
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5 mb-1.5', action.color)} />
                      <div className={cn('text-[11px] font-bold', isSelected ? action.color : 'text-neutral-300')}>
                        {action.label}
                      </div>
                      <div className="text-[9px] text-neutral-500 leading-tight mt-0.5">{action.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Result Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
              {error && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 leading-relaxed">
                  {error}
                </div>
              )}

              {result && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className={cn('h-1.5 w-1.5 rounded-full', currentAction.color.replace('text-', 'bg-'))} />
                    <span className={cn('text-[10px] font-bold uppercase tracking-wider', currentAction.color)}>
                      {currentAction.label} Result
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-900 text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {result}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-neutral-900 flex gap-2">
              {result && (
                <>
                  <button
                    onClick={handleCopy}
                    className="flex-1 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                  >
                    {copied ? (
                      <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied!</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </button>
                  <button
                    onClick={handleReset}
                    className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white transition-colors"
                    title="Clear result"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={handleRunAI}
                disabled={loading}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                  result ? 'flex-none px-4' : '',
                  loading
                    ? 'bg-neutral-900 border border-neutral-800 text-neutral-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/20'
                )}
              >
                <FilePen className="h-3.5 w-3.5" />
                {result ? 'Regenerate' : 'Run AI'}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
