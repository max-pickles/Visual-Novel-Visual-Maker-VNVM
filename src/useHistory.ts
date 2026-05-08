import { useState, useCallback, useRef } from 'react';

/**
 * Tab-Specific Undo/Redo history management.
 * Maintains independent history stacks for different domains (tabs) of the app.
 */
export const useTabHistory = <T>() => {
  const [histories, setHistories] = useState<Record<string, { past: T[], future: T[] }>>({});
  const historiesRef = useRef<Record<string, { past: T[], future: T[] }>>({});
  const lastPushTimeRef = useRef<Record<string, number>>({});

  const pushState = useCallback((tab: string, oldState: T) => {
    const tabHistory = historiesRef.current[tab] || { past: [], future: [] };
    
    // Avoid pushing duplicate states sequentially for the same tab
    if (tabHistory.past.length > 0 && JSON.stringify(tabHistory.past[tabHistory.past.length - 1]) === JSON.stringify(oldState)) {
      return;
    }

    const now = Date.now();
    const lastPush = lastPushTimeRef.current[tab] || 0;

    // Time-based grouping: if continuous rapid actions occur (e.g. dragging a slider or typing)
    // within 500ms of each other, DO NOT push a new state. This groups them into a single undo step.
    if (now - lastPush < 500) {
      lastPushTimeRef.current[tab] = now;
      return;
    }
    
    const newHistories = {
      ...historiesRef.current,
      [tab]: {
        past: [...tabHistory.past, oldState],
        future: [] // Clear redo history on new action
      }
    };
    historiesRef.current = newHistories;
    lastPushTimeRef.current[tab] = now;
    setHistories(newHistories);
  }, []);

  const popUndo = useCallback((tab: string, currentState: T): T | null => {
    const tabHistory = historiesRef.current[tab];
    // Keep at least one valid state? Actually if past.length === 0 we can't undo
    if (!tabHistory || tabHistory.past.length === 0) return null;
    
    const newPast = tabHistory.past.slice(0, -1);
    const stateToRestore = tabHistory.past[tabHistory.past.length - 1];
    const newFuture = [currentState, ...tabHistory.future];
    
    const newHistories = {
      ...historiesRef.current,
      [tab]: { past: newPast, future: newFuture }
    };
    historiesRef.current = newHistories;
    setHistories(newHistories);
    return stateToRestore;
  }, []);

  const popRedo = useCallback((tab: string, currentState: T): T | null => {
    const tabHistory = historiesRef.current[tab];
    if (!tabHistory || tabHistory.future.length === 0) return null;
    
    const stateToRestore = tabHistory.future[0];
    const newFuture = tabHistory.future.slice(1);
    const newPast = [...tabHistory.past, currentState];
    
    const newHistories = {
      ...historiesRef.current,
      [tab]: { past: newPast, future: newFuture }
    };
    historiesRef.current = newHistories;
    setHistories(newHistories);
    return stateToRestore;
  }, []);

  const canUndo = useCallback((tab: string) => {
    return (historiesRef.current[tab]?.past.length ?? 0) > 0;
  }, []);

  const canRedo = useCallback((tab: string) => {
    return (historiesRef.current[tab]?.future.length ?? 0) > 0;
  }, []);

  return { pushState, popUndo, popRedo, canUndo, canRedo, histories };
};
