// src/components/report/ReportDashboard.tsx
import { useState, useEffect, useCallback } from 'react';
import { db } from '../../db/db';
import { getApiBaseUrl } from '../../config';

interface ReportDashboardProps {
  onNewReport: () => void;
  onEditReport: (reportId: number) => void;
  setCurrentView: (view: any) => void;
}

export function ReportDashboard({ onNewReport, onEditReport }: ReportDashboardProps) {
  const [reports, setReports] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const apiBase = getApiBaseUrl();

  const loadLocalReports = useCallback(async () => {
    const allReports = await db.reports.toArray();
    allReports.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    setReports(allReports);
  }, []);

  const syncFromCloud = useCallback(async (manual = false) => {
    if (!navigator.onLine) {
      if (manual) setSyncMessage({ type: 'error', text: 'Perangkat sedang offline.' });
      return;
    }
    setIsSyncing(true);
    if (manual) setSyncMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/report?action=reports`);
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.reports)) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const localAll = await db.reports.toArray();
      const byCloudId = new Map<string, any>();
      for (const loc of localAll) {
        if (loc.cloudId) byCloudId.set(loc.cloudId, loc);
      }

      const remoteCloudIds = new Set<string>();
      let pulledCount = 0;

      for (const remote of data.reports) {
        if (!remote?.cloudId) continue;
        remoteCloudIds.add(remote.cloudId);
        const existing = byCloudId.get(remote.cloudId);
        if (existing) {
          const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
          const localTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
          if (remoteTime >= localTime) {
            await db.reports.put({
              ...existing,
              ...remote,
              id: existing.id,
            });
          }
        } else {
          await db.reports.add({
            ...remote,
            createdAt: remote.createdAt || new Date().toISOString(),
          });
          pulledCount++;
        }
      }

      // Push laporan lokal yang belum ada di cloud index (mis. dibuat sebelum update sync lintas device)
      let pushedCount = 0;
      for (const loc of localAll) {
        const cid = loc.cloudId || `${loc.inspectionTypeCode || 'IPP'}_${loc.inspectionId || loc.id}`;
        if (!remoteCloudIds.has(cid)) {
          if (!loc.cloudId) {
            await db.reports.update(loc.id, { cloudId: cid });
          }
          const { skpAhliImage: _s1, skpPerusahaanImage: _s2, ...safeGeneral } = loc.generalData || {};
          const summary = {
            cloudId: cid,
            inspectionId: loc.inspectionId || '',
            reportNumber: loc.reportNumber || '',
            inspectionTypeCode: loc.inspectionTypeCode || 'IPP',
            configVersion: loc.configVersion || '2.0.0',
            status: loc.status || 'completed',
            generalData: safeGeneral,
            technicalData: loc.technicalData || {},
            checklistData: loc.checklistData || {},
            formulaResults: loc.formulaResults || {},
            aiNarrative: loc.aiNarrative || {},
            docxDriveFileId: loc.docxDriveFileId || '',
            pdfDriveFileId: loc.pdfDriveFileId || '',
            driveFileId: loc.driveFileId || loc.pdfDriveFileId || loc.docxDriveFileId || '',
            createdAt: loc.createdAt || new Date().toISOString(),
            updatedAt: loc.updatedAt || new Date().toISOString(),
          };
          const pushRes = await fetch(`${apiBase}/api/report?action=reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report: summary }),
          });
          if (pushRes.ok) {
            pushedCount++;
            remoteCloudIds.add(cid);
          }
        }
      }

      await loadLocalReports();
      if (manual) {
        setSyncMessage({
          type: 'success',
          text: `Sinkron selesai: ${data.reports.length} di cloud (${pulledCount} baru ditarik, ${pushedCount} lokal diunggah).`,
        });
      }
    } catch (err: any) {
      console.warn('[ReportDashboard] Gagal sync daftar laporan dari cloud:', err);
      if (manual) {
        setSyncMessage({ type: 'error', text: `Gagal sync cloud: ${err.message}` });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [apiBase, loadLocalReports]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        await loadLocalReports();
      } finally {
        setIsLoading(false);
      }
      await syncFromCloud();
    };
    init();
  }, [loadLocalReports, syncFromCloud]);

  const deleteReport = async (report: any) => {
    if (!confirm('Apakah Anda yakin ingin menghapus laporan ini?')) return;
    await db.reports.delete(report.id);
    if (report.cloudId && navigator.onLine) {
      try {
        await fetch(`${apiBase}/api/report?action=reports&cloudId=${encodeURIComponent(report.cloudId)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('[ReportDashboard] Gagal hapus laporan di cloud:', err);
      }
    }
    await loadLocalReports();
  };

  const filteredReports = reports.filter(r => {
    if (filterStatus === 'all') return true;
    return r.status === filterStatus;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'in_review': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'ready': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'generating': return 'bg-sky-100 text-sky-700 border-sky-200 animate-pulse';
      case 'preview': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'approved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'locked': return 'bg-slate-100 text-slate-700 border-slate-300';
      default: return 'bg-gray-50 text-gray-500 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Draf';
      case 'completed': return 'Selesai';
      case 'in_review': return 'Review';
      case 'ready': return 'Siap';
      case 'generating': return 'Proses';
      case 'preview': return 'Preview';
      case 'approved': return 'Approved';
      case 'locked': return 'Terkunci';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-2">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <span>📄</span> Laporan Riksa Uji K3
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Daftar laporan tersinkron otomatis lintas perangkat (Desktop & HP) melalui Google Drive.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => syncFromCloud(true)}
            disabled={isSyncing}
            className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs px-4 py-3 rounded-xl transition-all disabled:opacity-50"
          >
            <span>{isSyncing ? '⏳' : '🔄'}</span>
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sync Cloud'}</span>
          </button>
          <button
            onClick={onNewReport}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-sm px-5 py-3 rounded-xl shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/25 active:scale-95 transition-all"
          >
            <span>➕</span> Buat Laporan Baru
          </button>
        </div>
      </div>

      {syncMessage && (
        <div
          className={`px-4 py-3 rounded-xl text-xs font-bold border ${
            syncMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {syncMessage.text}
        </div>
      )}

      {/* Filter and Stats */}
      <div className="flex flex-wrap gap-2 items-center bg-gray-50/50 p-2.5 rounded-xl border border-gray-200/50">
        <span className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">Filter Status:</span>
        {['all', 'completed', 'draft', 'generating'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
              filterStatus === status
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {status === 'all' ? 'Semua' : getStatusLabel(status)}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-gray-500 font-bold">Memuat laporan...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-gray-150 p-8 shadow-sm">
          <div className="text-5xl mb-4 opacity-50">📄</div>
          <h3 className="text-sm font-bold text-gray-700">Belum ada laporan</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-sm">
            Laporan K3 yang Anda buat di Desktop maupun HP akan muncul di sini setelah tersinkron.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredReports.map((report) => {
            const docxId = report.docxDriveFileId || (report.pdfDriveFileId ? '' : report.driveFileId);
            const pdfId = report.pdfDriveFileId || '';
            const legacyId = report.generatedFileId;
            return (
              <div
                key={report.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${getStatusBadgeClass(report.status)}`}>
                      {getStatusLabel(report.status)}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold">
                      {new Date(report.updatedAt || report.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-gray-900 line-clamp-1">
                      {report.generalData?.companyName || 'Klien Tanpa Nama'}
                    </h4>
                    <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                      No: {report.reportNumber || 'Belum Dialokasikan'}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1 font-medium flex items-center gap-1.5">
                      <span>⚡</span> Tipe: {report.inspectionTypeCode === 'IL' ? 'Instalasi Listrik' : 'Penyalur Petir (IPP)'}
                    </p>
                    {report.technicalData?.lokasiPemasangan && (
                      <p className="text-[11px] text-gray-400 font-medium line-clamp-1">
                        Lokasi: {report.technicalData.lokasiPemasangan}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => onEditReport(report.id)}
                      className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 active:scale-95 transition-all"
                    >
                      {report.status === 'locked' ? 'Detail' : 'Edit Laporan'}
                    </button>
                    {docxId && (
                      <a
                        href={`https://drive.google.com/file/d/${docxId}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-all"
                      >
                        📝 Word
                      </a>
                    )}
                    {pdfId && (
                      <a
                        href={`https://drive.google.com/file/d/${pdfId}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-all"
                      >
                        📄 PDF
                      </a>
                    )}
                    {!docxId && !pdfId && legacyId && (
                      <a
                        href={`https://docs.google.com/document/d/${legacyId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all"
                      >
                        📂 Drive
                      </a>
                    )}
                  </div>

                  {report.status !== 'locked' && (
                    <button
                      onClick={() => deleteReport(report)}
                      className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 p-1.5 rounded-lg hover:bg-rose-100 transition-all"
                      title="Hapus Laporan"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
