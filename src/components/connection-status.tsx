'use client';

import React, { useEffect, useState } from 'react';
import { useEditorStore } from '@/lib/store/editor-store';
import { Wifi, WifiOff, CloudLightning, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const {
    networkStatus,
    syncStatus,
    pendingOpsCount,
    failedOpsCount,
    lastSyncTime,
    initialize,
    setNetworkStatus,
  } = useEditorStore();

  const [timeAgo, setTimeAgo] = useState<string>('Never');

  // Sync network status with window listeners
  useEffect(() => {
    initialize();

    const handleOnline = () => setNetworkStatus('online');
    const handleOffline = () => setNetworkStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initialize, setNetworkStatus]);

  // Update "last sync" relative time string
  useEffect(() => {
    if (!lastSyncTime) {
      setTimeAgo('Never');
      return;
    }

    const updateTime = () => {
      const diff = Date.now() - lastSyncTime;
      if (diff < 5000) {
        setTimeAgo('Just now');
      } else if (diff < 60000) {
        setTimeAgo(`${Math.floor(diff / 1000)}s ago`);
      } else if (diff < 3600000) {
        setTimeAgo(`${Math.floor(diff / 60000)}m ago`);
      } else {
        setTimeAgo(new Date(lastSyncTime).toLocaleTimeString());
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 5000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  const isOnline = networkStatus === 'online';

  return (
    <div className="flex items-center gap-4 px-3 py-1.5 rounded-full bg-neutral-900/40 backdrop-blur-md border border-neutral-800 text-xs font-medium text-neutral-300">
      {/* Network Status Badge */}
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {isOnline && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full h-2 w-2",
              isOnline ? "bg-emerald-500" : "bg-rose-500"
            )}
          />
        </span>
        <span className="flex items-center gap-1">
          {isOnline ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-neutral-200">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
              <span className="text-rose-400">Offline Mode</span>
            </>
          )}
        </span>
      </div>

      <div className="h-3 w-px bg-neutral-800" />

      {/* Sync Status Badge */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-neutral-500 hidden sm:inline">
          Last synced: {timeAgo}
        </span>
      </div>
    </div>
  );
}
