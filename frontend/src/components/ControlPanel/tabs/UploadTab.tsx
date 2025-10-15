import React, { useCallback, useMemo, useState } from "react";

import type { ChunkData, BboxData } from "../../../types/chunks";

import { ApiService } from "../../../services/api";
import styles from "../ControlPanel.module.css";

const DEFAULT_TEXT_VALUE = "04852fcf-2fbf-477a-ab78-5a6970614c96";

type UploadTabProps = {
  onProcessChunks: (chunks: ChunkData[]) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  bboxManager?: {
    deletedBboxes: BboxData[];
  };
  lastJobId: string | null;
  setLastJobId: (jobId: string | null) => void;
};

export const UploadTab: React.FC<UploadTabProps> = ({
  onProcessChunks,
  isLoading,
  error,
  bboxManager,
  lastJobId,
  setLastJobId,
}) => {
  const [textInput, setTextInput] = useState<string>(DEFAULT_TEXT_VALUE);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isFileSubmitting, setIsFileSubmitting] = useState(false);

  const effectiveError = useMemo(
    () => localError || error,
    [localError, error],
  );

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTextInput(event.target.value);
      setLocalError(null);
    },
    [],
  );

  const handleUpload = useCallback(async () => {
    const trimmed = textInput.trim();
    if (!trimmed) {
      setLocalError("Введите корректный job_id");
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);
    setLastJobId(trimmed);

    ApiService.getJobResults(trimmed)
      .then((response) => {
        if (!response.success || !response.data) {
          throw new Error(response.error || "Ошибка получения данных");
        }
        return onProcessChunks(response.data.results);
      })
      .then(() => {
        setTextInput("");
      })
      .catch((uploadError) => {
        const message =
          uploadError instanceof Error
            ? uploadError.message
            : "Не удалось загрузить данные";
        setLocalError(message);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, [onProcessChunks, textInput, setLastJobId]);

  const isButtonDisabled = isLoading || isSubmitting;
  const isTextEmpty = !textInput.trim();
  const isAnySubmitting = isLoading || isSubmitting || isFileSubmitting;

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      setSelectedFile(f);
      setLocalError(null);
    },
    [],
  );

  const handleFileUpload = useCallback(() => {
    if (!selectedFile) {
      setLocalError("Выберите файл .pcd");
      return;
    }
    setIsFileSubmitting(true);
    setLocalError(null);
    ApiService.processPcd(selectedFile)
      .then((response) => {
        if (!response.success || !response.data) {
          throw new Error(response.error || "Ошибка обработки файла");
        }
        setLastJobId(response.data.job_id);
        return onProcessChunks(response.data.results);
      })
      .then(() => {
        setSelectedFile(null);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Ошибка загрузки";
        setLocalError(message);
      })
      .finally(() => setIsFileSubmitting(false));
  }, [onProcessChunks, selectedFile, setLastJobId]);

  const handleExportPcd = useCallback(async () => {
    console.log("=== Экспорт PCD ===");
    console.log("Текущий job_id:", lastJobId || "Недоступен");

    if (!lastJobId) {
      setLocalError("Нет доступного job_id для экспорта");
      return;
    }

    if (!bboxManager?.deletedBboxes || bboxManager.deletedBboxes.length === 0) {
      setLocalError("Не найдено удаленных bbox");
      return;
    }

    try {
      const request = {
        job_id: lastJobId,
        bounding_box: bboxManager.deletedBboxes.map(
          (bbox) => bbox.bounding_box,
        ),
      };

      console.log("Отправка запроса экспорта:", request);
      console.log("Вызов ApiService.exportPcd...");
      const response = await ApiService.exportPcd(request);
      console.log("Получен ответ экспорта:", response);

      if (response.success && response.data?.download_url) {
        console.log("Экспорт успешен, загрузка файла...");

        console.log("Загрузка файла по URL:", response.data.download_url);
        const blob = await ApiService.downloadPcd(response.data.download_url);
        console.log("Получен blob файла, размер:", blob.size, "байт");

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `exported_${lastJobId}.pcd`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        console.log("Файл успешно загружен");
      } else {
        console.error("Ошибка экспорта:", response.error);
        setLocalError(response.error || "Ошибка экспорта");
      }
    } catch (error) {
      console.error("Ошибка экспорта:", error);
      const message =
        error instanceof Error ? error.message : "Ошибка экспорта";
      setLocalError(message);
    }
  }, [bboxManager?.deletedBboxes, lastJobId]);

  return (
    <div>
      <div className={styles.uploadGroup}>
        <h3 className={styles.tabTitle}>Загрузка облака точек из файла</h3>
        <div className={styles.inputGroup}>
          <input
            type="file"
            accept=".pcd"
            onChange={handleFileChange}
            className={styles.textInput}
            aria-label="PCD файл"
          />
          <button
            onClick={handleFileUpload}
            disabled={isAnySubmitting || !selectedFile}
            className={`${styles.uploadButton} ${
              isAnySubmitting || !selectedFile
                ? styles.uploadButtonDisabled
                : ""
            }`}
            title={isAnySubmitting ? "Загрузка..." : "Загрузить файл"}
            type="button"
          >
            {isAnySubmitting ? "⏳" : "⬆️"}
          </button>
        </div>
      </div>
      <div className={styles.uploadGroup}>
        <h3 className={styles.tabTitle}>
          Загрузка кэшированного облака по job_id
        </h3>

        <div className={styles.inputGroup}>
          <input
            type="text"
            placeholder="Введите job_id..."
            value={textInput}
            onChange={handleTextChange}
            className={styles.textInput}
            aria-label="Идентификатор задачи"
          />
          <button
            onClick={handleUpload}
            disabled={isAnySubmitting || isTextEmpty}
            className={`${styles.uploadButton} ${
              isAnySubmitting || isTextEmpty ? styles.uploadButtonDisabled : ""
            }`}
            title={isAnySubmitting ? "Загрузка..." : "Загрузить"}
            type="button"
          >
            {isAnySubmitting ? "⏳" : "⬆️"}
          </button>
        </div>

        {textInput.trim() && !isButtonDisabled && (
          <div className={styles.inputInfo}>ID задачи: {textInput}</div>
        )}

        {(isLoading || isSubmitting || isFileSubmitting) && (
          <div className={styles.loadingInfo}>
            Загрузка и обработка данных...
          </div>
        )}

        {effectiveError && (
          <div className={styles.errorInfo}>Ошибка: {effectiveError}</div>
        )}
      </div>

      <div className={styles.uploadGroup}>
        <h3 className={styles.tabTitle}>Экспорт облака точек</h3>
        <button
          onClick={handleExportPcd}
          className={styles.exportButton}
          type="button"
        >
          📥 Экспорт PCD
        </button>
      </div>
    </div>
  );
};
