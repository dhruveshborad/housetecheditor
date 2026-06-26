import React from 'react';
import { GitFork, User } from 'lucide-react';
import { FaGithub, FaLinkedin } from 'react-icons/fa';

export function Footer() {
  return (
    <footer className="w-full bg-black/40 backdrop-blur-md border-t border-neutral-900/80 py-4 px-4 sm:px-6 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <span className="font-bold text-[10px]">SF</span>
          </div>
          <span className="font-medium text-neutral-400">HouseEditor (SyncForge)</span>
        </div>

        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-2 sm:gap-6">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <User className="h-3.5 w-3.5 text-indigo-400" />
            <span>Developer: <strong className="text-neutral-300">dhruvesh borad</strong></span>
          </div>
          <a
            href="https://github.com/dhruveshborad"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-neutral-300 transition-colors"
          >
            <FaGithub className="h-4 w-4 text-neutral-400 hover:text-neutral-200 transition-colors" />
            <span>GitHub</span>
          </a>
          <a
            href="https://www.linkedin.com/in/dhruveshkumar-borad"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-neutral-300 transition-colors"
          >
            <FaLinkedin className="h-4 w-4 text-neutral-400 hover:text-neutral-200 transition-colors" />
            <span>LinkedIn</span>
          </a>
          <a
            href="https://github.com/dhruveshborad/houseeditor"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-neutral-300 transition-colors"
          >
            <GitFork className="h-3.5 w-3.5" />
            <span>Repository</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
