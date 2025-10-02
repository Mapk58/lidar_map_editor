import type { ChunkData, ProcessedChunkData } from '../types/chunks';

export class ChunkProcessor {
  /**
   * Обрабатывает один чанк - просто сохраняет URL файлов
   */
  static async processChunk(chunkData: ChunkData): Promise<ProcessedChunkData> {
    const { chunk_id } = chunkData;

    return {
      chunk_id,
      ground: [],
      static: [],
      dynamic: [],
      originalData: chunkData,
    };
  }

  /**
   * Обрабатывает массив чанков параллельно
   */
  static async processChunks(
    chunks: ChunkData[]
  ): Promise<ProcessedChunkData[]> {
    return Promise.all(chunks.map(chunk => this.processChunk(chunk)));
  }

  /**
   * Получает статистику по обработанным чанкам
   */
  static getChunkStats(processedChunk: ProcessedChunkData): {
    chunk_id: number;
  } {
    return {
      chunk_id: processedChunk.chunk_id,
    };
  }
}
