"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface LoadingContextValue {
  loadingLayers: Set<string>;
  setLayerLoading: (id: string, loading: boolean) => void;
}

const LoadingContext = createContext<LoadingContextValue>({
  loadingLayers: new Set(),
  setLayerLoading: () => {},
});

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [loadingLayers, setLoadingLayers] = useState<Set<string>>(new Set());

  const setLayerLoading = useCallback((id: string, loading: boolean) => {
    setLoadingLayers((prev) => {
      if (loading && prev.has(id)) return prev;
      if (!loading && !prev.has(id)) return prev;
      const next = new Set(prev);
      if (loading) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ loadingLayers, setLayerLoading }),
    [loadingLayers, setLayerLoading]
  );

  return (
    <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
  );
}

export function useLoadingContext() {
  return useContext(LoadingContext);
}
