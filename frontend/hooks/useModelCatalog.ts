"use client";

import { useCallback, useEffect, useState } from "react";

import { getModelCatalog } from "@/lib/api";
import type { ModelInfo } from "@/lib/modelCatalog";

/**
 * Loads the model catalog from GET /models. The backend is the single
 * source of truth — nothing is hardcoded here. When the backend is
 * unreachable the selector shows an honest error with a retry action.
 */
export function useModelCatalog() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getModelCatalog();
      setModels(list);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The model catalog could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { models, loading, error, reload };
}