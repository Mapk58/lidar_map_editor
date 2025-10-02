import axios, { type AxiosResponse } from 'axios';

import type {
  ApiJobResponse,
  ExportPcdRequest,
  ExportPcdResponse,
} from '../types/chunks';

const API_BASE_URL = 'http://localhost:8000';

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export class ApiService {
  /**
   * Получить результаты джоба по job_id
   */
  static getJobResults(jobId: string): Promise<ApiResponse<ApiJobResponse>> {
    return apiClient
      .get(`/results/${jobId}`)
      .then((response: AxiosResponse<ApiJobResponse>) => ({
        success: true,
        data: response.data,
      }))
      .catch(error => ({
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      }));
  }

  /**
   * Загрузить PCD-файл для обработки
   */
  static processPcd(file: File): Promise<ApiResponse<ApiJobResponse>> {
    const form = new FormData();
    form.append('file', file);

    return apiClient
      .post('/process_pcd', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((response: AxiosResponse<ApiJobResponse>) => ({
        success: true,
        data: response.data,
      }))
      .catch(error => ({
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      }));
  }

  /**
   * Экспортировать PCD файл с удаленными областями
   */
  static exportPcd(
    request: ExportPcdRequest
  ): Promise<ApiResponse<ExportPcdResponse>> {
    console.log('ApiService.exportPcd: Sending POST request to /results');
    console.log('ApiService.exportPcd: Request data:', request);
    return apiClient
      .post('/results', request)
      .then((response: AxiosResponse<ExportPcdResponse>) => {
        console.log('ApiService.exportPcd: Response received:', response.data);
        return {
          success: true,
          data: response.data,
        };
      })
      .catch(error => {
        console.error('ApiService.exportPcd: Error occurred:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        };
      });
  }

  /**
   * Скачать PCD файл по URL
   */
  static downloadPcd(url: string): Promise<Blob> {
    console.log('ApiService.downloadPcd: Downloading file from:', url);
    return apiClient
      .get(url, {
        responseType: 'blob',
      })
      .then(response => {
        console.log(
          'ApiService.downloadPcd: File downloaded successfully, size:',
          response.data.size,
          'bytes'
        );
        return response.data;
      })
      .catch(error => {
        console.error('ApiService.downloadPcd: Download error:', error);
        throw error;
      });
  }
}
