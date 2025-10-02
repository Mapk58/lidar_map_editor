import { useState, useCallback } from 'react';

import type { ChunkData, ProcessedChunkData } from '../types/chunks';

import { ChunkProcessor } from '../utils/chunkProcessor';

type UseChunkProcessorReturn = {
  processedChunks: ProcessedChunkData[];
  isLoading: boolean;
  error: string | null;
  processChunks: (chunks: ChunkData[]) => Promise<void>;
  clearProcessedChunks: () => void;
  endLoading: () => void;
};

export const useChunkProcessor = (): UseChunkProcessorReturn => {
  const [processedChunks, setProcessedChunks] = useState<ProcessedChunkData[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearProcessedChunks = useCallback(() => {
    setProcessedChunks([]);
    setError(null);
  }, []);

  const processChunks = useCallback(async (chunks: ChunkData[]) => {
    setIsLoading(true);
    setError(null);
    setProcessedChunks([]);

    ChunkProcessor.processChunks(chunks)
      .then(processed => {
        setProcessedChunks(processed);
      })
      .catch(err => {
        const errorMessage =
          err instanceof Error ? err.message : 'Неизвестная ошибка';
        setError(errorMessage);
        setIsLoading(false);
      });
  }, []);

  const endLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  return {
    processedChunks,
    isLoading,
    error,
    processChunks,
    clearProcessedChunks,
    endLoading,
  };
};
