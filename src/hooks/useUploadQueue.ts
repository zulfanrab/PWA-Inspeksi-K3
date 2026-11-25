import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { SessionRepository } from '../db/db';
import {
  uploadToDrive,
  UploadCancelledError,
  type UploadProgress,
} from '../services/driveService';

export type UploadJobStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';

export interface UploadJob {
  id: string;
  clientName: string;
  objectType: string;
  unitName: string;
  status: UploadJobStatus;
  percentage: number;
  loaded: number;
  total: number;
  errorMessage?: string;
  isReSync?: boolean;
  autoRetryOnFail?: boolean;
  retried?: boolean;
}

interface UseUploadQueueOptions {
  isAuthenticated: boolean;
  onRefreshData: () => Promise<void>;
  onToast: (message: string, type?: 'success' | 'warn' | 'error') => void;
  onRequestWakeLock?: () => Promise<void>;
  onReleaseWakeLock?: () => void;
}

export function useUploadQueue({
  isAuthenticated,
  onRefreshData,
  onToast,
  onRequestWakeLock,
  onReleaseWakeLock,
}: UseUploadQueueOptions) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const jobsRef = useRef<UploadJob[]>([]);
  const isRunningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacksRef = useRef({
    isAuthenticated,
    onRefreshData,
    onToast,
    onRequestWakeLock,
    onReleaseWakeLock,
  });

  useEffect(() => {
    callbacksRef.current = {
      isAuthenticated,
      onRefreshData,
      onToast,
      onRequestWakeLock,
      onReleaseWakeLock,
    };
  }, [isAuthenticated, onRefreshData, onToast, onRequestWakeLock, onReleaseWakeLock]);

  const updateJobs = useCallback((updater: (prev: UploadJob[]) => UploadJob[]) => {
    const next = updater(jobsRef.current);
    jobsRef.current = next;
    setJobs(next);
    return next;
  }, []);

  const clearAutoDismiss = useCallback(() => {
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
      autoClearTimerRef.current = null;
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    clearAutoDismiss();

    await callbacksRef.current.onRequestWakeLock?.();

    let completedInRun = 0;
    let failedInRun = 0;
    let cancelledInRun = 0;

    try {
      while (true) {
        if (!navigator.onLine) {
          // Tandai item yang masih antre sebagai error koneksi agar bisa di-resume saat online
          updateJobs((prev) =>
            prev.map((j) =>
              j.status === 'queued'
                ? { ...j, status: 'error', errorMessage: 'Koneksi internet terputus' }
                : j
            )
          );
          break;
        }

        const nextJob = jobsRef.current.find((j) => j.status === 'queued');
        if (!nextJob) break;

        const freshSession = await SessionRepository.getById(nextJob.id);
        if (!freshSession || (freshSession.status === 'synced' && !nextJob.isReSync)) {
          updateJobs((prev) =>
            prev.map((j) =>
              j.id === nextJob.id
                ? { ...j, status: 'done', percentage: 100, loaded: j.total }
                : j
            )
          );
          continue;
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        updateJobs((prev) =>
          prev.map((j) =>
            j.id === nextJob.id
              ? {
                  ...j,
                  status: 'uploading',
                  percentage: Math.max(2, j.percentage),
                  total: freshSession.photos.length,
                  errorMessage: undefined,
                }
              : j
          )
        );

        try {
          const { folderId } = await uploadToDrive(
            freshSession,
            freshSession.photos,
            (progress: UploadProgress) => {
              updateJobs((prev) =>
                prev.map((j) =>
                  j.id === nextJob.id
                    ? {
                        ...j,
                        percentage: progress.percentage,
                        loaded: progress.loaded,
                        total: progress.total,
                      }
                    : j
                )
              );
            },
            null,
            controller.signal
          );

          await SessionRepository.markSynced(nextJob.id, folderId);
          updateJobs((prev) =>
            prev.map((j) =>
              j.id === nextJob.id
                ? {
                    ...j,
                    status: 'done',
                    percentage: 100,
                    loaded: j.total,
                    errorMessage: undefined,
                  }
                : j
            )
          );
          completedInRun++;
          await callbacksRef.current.onRefreshData();
        } catch (err: unknown) {
          if (err instanceof UploadCancelledError || controller.signal.aborted) {
            updateJobs((prev) =>
              prev.map((j) =>
                j.id === nextJob.id
                  ? { ...j, status: 'cancelled', errorMessage: 'Dibatalkan' }
                  : j
              )
            );
            cancelledInRun++;
          } else {
            const msg = err instanceof Error ? err.message : 'Gagal mengunggah data';
            const shouldAutoRetry = !!nextJob.autoRetryOnFail && !nextJob.retried && navigator.onLine;

            if (shouldAutoRetry) {
              // Masukkan kembali ke ujung antrean untuk 1x kesempatan ulang otomatis
              updateJobs((prev) => {
                const others = prev.filter((j) => j.id !== nextJob.id);
                return [
                  ...others,
                  {
                    ...nextJob,
                    status: 'queued',
                    retried: true,
                    percentage: 0,
                    errorMessage: undefined,
                  },
                ];
              });
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              updateJobs((prev) =>
                prev.map((j) =>
                  j.id === nextJob.id
                    ? { ...j, status: 'error', errorMessage: msg }
                    : j
                )
              );
              failedInRun++;
            }
          }
          await callbacksRef.current.onRefreshData();
        } finally {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
        }
      }

      const activeRemaining = jobsRef.current.some(
        (j) => j.status === 'queued' || j.status === 'uploading'
      );

      if (!activeRemaining) {
        if (completedInRun > 0 && failedInRun === 0 && cancelledInRun === 0) {
          callbacksRef.current.onToast(
            completedInRun === 1
              ? '✅ Data berhasil diunggah ke Google Drive!'
              : `✅ Semua ${completedInRun} unit berhasil diunggah ke Google Drive!`,
            'success'
          );
          autoClearTimerRef.current = setTimeout(() => {
            updateJobs((prev) => prev.filter((j) => j.status === 'queued' || j.status === 'uploading'));
          }, 4500);
        } else if (completedInRun > 0 && failedInRun > 0) {
          callbacksRef.current.onToast(
            `⚠️ ${completedInRun} unit berhasil, ${failedInRun} unit gagal diunggah`,
            'warn'
          );
        } else if (failedInRun > 0) {
          callbacksRef.current.onToast(
            `⚠️ Gagal mengunggah ${failedInRun} unit. Ketuk widget sync untuk coba lagi.`,
            'error'
          );
        } else if (cancelledInRun > 0) {
          callbacksRef.current.onToast('Upload dibatalkan.', 'warn');
        }
      }
    } finally {
      isRunningRef.current = false;
      callbacksRef.current.onReleaseWakeLock?.();
      await callbacksRef.current.onRefreshData();
    }
  }, [clearAutoDismiss, updateJobs]);

  const enqueueSessions = useCallback(
    async (
      sessionIds: string[],
      opts?: { isReSync?: boolean; autoRetryOnFail?: boolean; silentIfEmpty?: boolean }
    ) => {
      if (!callbacksRef.current.isAuthenticated) {
        if (!opts?.silentIfEmpty) {
          callbacksRef.current.onToast('⚠️ Silakan login Google terlebih dahulu.', 'warn');
        }
        return 0;
      }

      if (!navigator.onLine) {
        if (!opts?.silentIfEmpty) {
          callbacksRef.current.onToast('⚠️ Tidak ada koneksi internet.', 'warn');
        }
        return 0;
      }

      clearAutoDismiss();

      const activeSet = new Set(
        jobsRef.current
          .filter((j) => j.status === 'queued' || j.status === 'uploading')
          .map((j) => j.id)
      );

      const newJobs: UploadJob[] = [];
      for (const id of sessionIds) {
        if (activeSet.has(id)) continue;
        const session = await SessionRepository.getById(id);
        if (!session) continue;
        if (session.status === 'synced' && !opts?.isReSync) continue;

        activeSet.add(id);
        newJobs.push({
          id: session.id,
          clientName: session.clientName,
          objectType: session.objectType,
          unitName: session.unitData?.namaUnit || 'Unit Tanpa Nama',
          status: 'queued',
          percentage: 0,
          loaded: 0,
          total: session.photos.length,
          isReSync: opts?.isReSync,
          autoRetryOnFail: opts?.autoRetryOnFail,
          retried: false,
        });
      }

      if (newJobs.length === 0) {
        return 0;
      }

      const newIds = new Set(newJobs.map((j) => j.id));
      updateJobs((prev) => [
        ...prev.filter((j) => !newIds.has(j.id)),
        ...newJobs,
      ]);

      // Jika sudah ada upload berjalan, cukup beritahu user bahwa item masuk antrean
      if (isRunningRef.current) {
        callbacksRef.current.onToast(
          `📥 ${newJobs.length} unit ditambahkan ke antrean upload`,
          'success'
        );
      } else {
        void processQueue();
      }

      return newJobs.length;
    },
    [clearAutoDismiss, processQueue, updateJobs]
  );

  const enqueueAllDrafts = useCallback(
    async (opts?: { silentIfEmpty?: boolean }) => {
      const allDrafts = await SessionRepository.getDrafts();
      if (allDrafts.length === 0) return 0;
      return enqueueSessions(
        allDrafts.map((d) => d.id),
        { autoRetryOnFail: true, silentIfEmpty: opts?.silentIfEmpty }
      );
    },
    [enqueueSessions]
  );

  const retryFailed = useCallback(() => {
    clearAutoDismiss();
    const hasRetryable = jobsRef.current.some(
      (j) => j.status === 'error' || j.status === 'cancelled'
    );
    if (!hasRetryable) return;

    updateJobs((prev) =>
      prev.map((j) =>
        j.status === 'error' || j.status === 'cancelled'
          ? {
              ...j,
              status: 'queued',
              percentage: 0,
              errorMessage: undefined,
              retried: false,
            }
          : j
      )
    );
    void processQueue();
  }, [clearAutoDismiss, processQueue, updateJobs]);

  const cancelJob = useCallback(
    (id: string) => {
      const target = jobsRef.current.find((j) => j.id === id);
      if (!target) return;

      if (target.status === 'uploading') {
        abortControllerRef.current?.abort();
      } else if (target.status === 'queued') {
        updateJobs((prev) =>
          prev.map((j) =>
            j.id === id
              ? { ...j, status: 'cancelled', errorMessage: 'Dibatalkan' }
              : j
          )
        );
      }
    },
    [updateJobs]
  );

  const cancelAll = useCallback(() => {
    updateJobs((prev) =>
      prev.map((j) =>
        j.status === 'queued'
          ? { ...j, status: 'cancelled', errorMessage: 'Dibatalkan' }
          : j
      )
    );
    abortControllerRef.current?.abort();
  }, [updateJobs]);

  const dismissFinished = useCallback(() => {
    clearAutoDismiss();
    updateJobs((prev) =>
      prev.filter((j) => j.status === 'queued' || j.status === 'uploading')
    );
  }, [clearAutoDismiss, updateJobs]);

  useEffect(() => {
    return () => {
      clearAutoDismiss();
      abortControllerRef.current?.abort();
    };
  }, [clearAutoDismiss]);

  const derived = useMemo(() => {
    const activeJob = jobs.find((j) => j.status === 'uploading') || null;
    const queuedCount = jobs.filter((j) => j.status === 'queued').length;
    const doneCount = jobs.filter((j) => j.status === 'done').length;
    const errorCount = jobs.filter((j) => j.status === 'error').length;
    const isUploading = !!activeJob || queuedCount > 0;

    // Bobot progress gabungan agar persenan tidak pernah reset ke 0% saat pindah unit
    const activeBatchJobs = jobs.filter((j) => j.status !== 'cancelled');
    let totalWeight = 0;
    let doneWeight = 0;
    let totalPhotos = 0;
    let loadedPhotos = 0;

    for (const j of activeBatchJobs) {
      const weight = Math.max(1, j.total);
      totalWeight += weight;
      totalPhotos += j.total;

      if (j.status === 'done') {
        doneWeight += weight;
        loadedPhotos += j.total;
      } else if (j.status === 'uploading') {
        doneWeight += (j.percentage / 100) * weight;
        loadedPhotos += j.loaded;
      }
    }

    const overallPercent =
      totalWeight > 0 ? Math.min(100, Math.round((doneWeight / totalWeight) * 100)) : 0;

    const queuedOrUploadingIds = new Set(
      jobs
        .filter((j) => j.status === 'queued' || j.status === 'uploading')
        .map((j) => j.id)
    );

    const uploadProgress: UploadProgress | null = activeJob
      ? {
          percentage: activeJob.percentage,
          loaded: activeJob.loaded,
          total: activeJob.total,
        }
      : null;

    return {
      activeJob,
      queuedCount,
      doneCount,
      errorCount,
      isUploading,
      overallPercent,
      totalPhotos,
      loadedPhotos,
      queuedOrUploadingIds,
      uploadingId: activeJob?.id ?? null,
      uploadProgress,
    };
  }, [jobs]);

  return {
    jobs,
    ...derived,
    enqueueSessions,
    enqueueAllDrafts,
    retryFailed,
    cancelJob,
    cancelAll,
    dismissFinished,
  };
}
