// src/components/report/ReportDashboard.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../../db/db';
import { getApiBaseUrl } from '../../config';
import { parseApiJson } from '../../utils/reportHelpers';

interface ReportDashboardProps {
  onNewReport: () => void;
  onEditReport: (reportId: number) => void;
  setCurrentView: (view: any) => void;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function resolveReportDate(report: any): Date {
  const raw = report.generalData?.reportDate || report.updatedAt || report.createdAt;
  if (raw) {
    const str = String(raw).trim();
    const ymd = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    const d = ymd
      ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0)
      : new Date(str.includes('T') ? str : `${str}T12:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(report.createdAt || Date.now());
}

function getTypeLabel(code: string): string {
  const upper = String(code || '').toUpperCase();
  if (upper === 'IPP') return 'Penyalur Petir (IPP)';
  if (upper === 'IL') return 'Instalasi Listrik (IL)';
  return upper || 'Laporan K3';
}

export function ReportDashboard({ onNewReport, onEditReport }: ReportDashboardProps) {
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter & UX states (siap skala ratusan laporan lintas tahun 2026 -> 2027+)
  const [viewMode, setViewMode] = useState<'byMonth' | 'byClient'>('byMonth');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [visibleLimit, setVisibleLimit] = useState<number>(20);
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());

  const apiBase = getApiBaseUrl();

  const loadLocalReports = useCallback(async () => {
    const allReports = await db.reports.toArray();
    allReports.sort((a, b) => resolveReportDate(b).getTime() - resolveReportDate(a).getTime());
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
      const res = await fetch(`${apiBase}/api/report?action=reports`, { cache: 'no-store' });
      const data = await parseApiJson(res);
      if (!res.ok || !data.success || !Array.isArray(data.reports)) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const deletedCloudSet = new Set<string>(
        Array.isArray(data.deletedCloudIds) ? data.deletedCloudIds.map(String) : []
      );

      const localAll = await db.reports.toArray();
      const byCloudId = new Map<string, any>();
      for (const loc of localAll) {
        if (loc.cloudId && deletedCloudSet.has(loc.cloudId)) {
          await db.reports.delete(loc.id);
          continue;
        }
        if (loc.cloudId) byCloudId.set(loc.cloudId, loc);
      }

      const remoteCloudIds = new Set<string>();
      let pulledCount = 0;

      for (const remote of data.reports) {
        if (!remote?.cloudId || deletedCloudSet.has(remote.cloudId)) continue;
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
              generalData: {
                ...(remote.generalData || {}),
                skpAhliImage: remote.generalData?.skpAhliImage || existing.generalData?.skpAhliImage || '',
                skpPerusahaanImage:
                  remote.generalData?.skpPerusahaanImage || existing.generalData?.skpPerusahaanImage || '',
              },
              photoDocumentation: remote.photoDocumentation || existing.photoDocumentation,
              bapAttachments:
                Array.isArray(remote.bapAttachments) && remote.bapAttachments.length > 0
                  ? remote.bapAttachments
                  : existing.bapAttachments,
              extraAttachments:
                Array.isArray(remote.extraAttachments) && remote.extraAttachments.length > 0
                  ? remote.extraAttachments
                  : existing.extraAttachments,
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

      let pushedCount = 0;
      const freshLocal = await db.reports.toArray();
      for (const loc of freshLocal) {
        const cid = loc.cloudId || `${loc.inspectionTypeCode || 'IPP'}_${loc.inspectionId || loc.id}`;
        if (deletedCloudSet.has(cid)) continue;
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
      await syncFromCloud(false);
    };
    init();
  }, [loadLocalReports, syncFromCloud]);

  const deleteReport = async (report: any) => {
    if (!confirm(`Hapus laporan "${report.generalData?.companyName || report.reportNumber || 'ini'}"?`)) return;
    await db.reports.delete(report.id);
    if (report.cloudId && navigator.onLine) {
      try {
        const res = await fetch(`${apiBase}/api/report?action=reports&cloudId=${encodeURIComponent(report.cloudId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          setSyncMessage({ type: 'error', text: `Laporan dihapus lokal, tetapi gagal sinkron hapus ke Drive (HTTP ${res.status}).` });
        }
      } catch (err: any) {
        setSyncMessage({ type: 'error', text: `Laporan dihapus lokal, namun gagal terhubung ke cloud: ${err?.message || 'offline'}.` });
      }
    }
    await loadLocalReports();
  };

  // --- Opsi filter dinamis (otomatis mendukung 2026, 2027, dst.) ---
  const availableYears = useMemo(() => {
    const yrs = new Set<string>();
    yrs.add(String(new Date().getFullYear()));
    reports.forEach((r) => yrs.add(String(resolveReportDate(r).getFullYear())));
    return Array.from(yrs).sort((a, b) => b.localeCompare(a));
  }, [reports]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    reports.forEach((r) => {
      if (r.inspectionTypeCode) types.add(String(r.inspectionTypeCode).toUpperCase());
    });
    return Array.from(types).sort();
  }, [reports]);

  // --- Ringkasan Statistik ---
  const stats = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    let thisYear = 0;
    let thisMonth = 0;
    reports.forEach((r) => {
      const d = resolveReportDate(r);
      if (d.getFullYear() === curYear) {
        thisYear++;
        if (d.getMonth() === curMonth) thisMonth++;
      }
    });
    return { total: reports.length, thisYear, thisMonth };
  }, [reports]);

  // --- Filter & Search ---
  const filteredReports = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return reports.filter((r) => {
      const d = resolveReportDate(r);
      const yr = String(d.getFullYear());
      const mo = String(d.getMonth());
      const type = String(r.inspectionTypeCode || '').toUpperCase();

      if (filterYear !== 'all' && yr !== filterYear) return false;
      if (filterMonth !== 'all' && mo !== filterMonth) return false;
      if (filterType !== 'all' && type !== filterType) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;

      if (q) {
        const hay = [
          r.generalData?.companyName,
          r.reportNumber,
          r.technicalData?.lokasiPemasangan,
          r.generalData?.inspectorName,
          getTypeLabel(type),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, searchQuery, filterYear, filterMonth, filterType, filterStatus]);

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    filterYear !== 'all' ||
    filterMonth !== 'all' ||
    filterType !== 'all' ||
    filterStatus !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setFilterYear('all');
    setFilterMonth('all');
    setFilterType('all');
    setFilterStatus('all');
    setVisibleLimit(20);
  };

  // --- Grouping untuk tampilan Per Bulan & Per Klien ---
  const pagedReports = useMemo(
    () => filteredReports.slice(0, visibleLimit),
    [filteredReports, visibleLimit]
  );

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, { label: string; items: any[] }>();
    pagedReports.forEach((r) => {
      const d = resolveReportDate(r);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MONTH_NAMES_ID[d.getMonth()]} ${d.getFullYear()}`;
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(r);
    });
    return Array.from(groups.entries());
  }, [pagedReports]);

  const groupedByClient = useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredReports.forEach((r) => {
      const client = String(r.generalData?.companyName || 'Klien Tanpa Nama').trim();
      if (!groups.has(client)) groups.set(client, []);
      groups.get(client)!.push(r);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredReports]);

  const toggleClientGroup = (clientName: string) => {
    setOpenClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientName)) next.delete(clientName);
      else next.add(clientName);
      return next;
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'completed':
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'generating':
        return 'bg-sky-100 text-sky-700 border-sky-200 animate-pulse';
      default:
        return 'bg-gray-50 text-gray-500 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draf';
      case 'completed':
        return 'Selesai';
      case 'generating':
        return 'Proses';
      case 'approved':
        return 'Approved';
      default:
        return status || 'Draf';
    }
  };

  const renderReportCard = (report: any) => {
    const docxId = report.docxDriveFileId || (report.pdfDriveFileId ? '' : report.driveFileId);
    const pdfId = report.pdfDriveFileId || '';
    const legacyId = report.generatedFileId;
    const d = resolveReportDate(report);

    return (
      <div
        key={report.id}
        className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3"
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${getStatusBadgeClass(report.status)}`}>
                {getStatusLabel(report.status)}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                {String(report.inspectionTypeCode || 'IPP').toUpperCase()}
              </span>
            </div>
            <span className="text-[11px] text-gray-400 font-semibold">
              {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div>
            <h4 className="text-sm font-extrabold text-gray-900 line-clamp-1">
              {report.generalData?.companyName || 'Klien Tanpa Nama'}
            </h4>
            <p className="text-xs font-mono font-bold text-emerald-700 mt-0.5 truncate">
              {report.reportNumber || 'Belum ada nomor'}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-1">
              {report.technicalData?.lokasiPemasangan && (
                <span className="line-clamp-1">📍 {report.technicalData.lokasiPemasangan}</span>
              )}
              {report.generalData?.inspectorName && (
                <span className="line-clamp-1">👷 {report.generalData.inspectorName}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEditReport(report.id)}
              className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 active:scale-95 transition-all"
            >
              ✏️ Edit
            </button>
            {docxId && (
              <a
                href={`https://drive.google.com/file/d/${docxId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-all"
              >
                📝 Word
              </a>
            )}
            {pdfId && (
              <a
                href={`https://drive.google.com/file/d/${pdfId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-all"
              >
                📄 PDF
              </a>
            )}
            {!docxId && !pdfId && legacyId && (
              <a
                href={`https://docs.google.com/document/d/${legacyId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all"
              >
                📂 Drive
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={() => deleteReport(report)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1.5 rounded-lg hover:bg-rose-100 transition-all"
            title="Hapus Laporan"
            aria-label="Hapus Laporan"
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-4">
      {/* Header + Stats */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
              <span>📄</span> Laporan Riksa Uji K3
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Arsip laporan tersinkron otomatis Desktop ↔ HP lewat Google Drive.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => syncFromCloud(true)}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all disabled:opacity-50"
            >
              <span>{isSyncing ? '⏳' : '🔄'}</span>
              <span>{isSyncing ? 'Sinkron...' : 'Sync Cloud'}</span>
            </button>
            <button
              type="button"
              onClick={onNewReport}
              className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm active:scale-95 transition-all"
            >
              <span>➕</span>
              <span>Buat Laporan</span>
            </button>
          </div>
        </div>

        {/* Mini Stats */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Total Arsip</p>
            <p className="text-base font-black text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-emerald-700 uppercase">Tahun {new Date().getFullYear()}</p>
            <p className="text-base font-black text-emerald-800">{stats.thisYear}</p>
          </div>
          <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-blue-700 uppercase">Bulan Ini</p>
            <p className="text-base font-black text-blue-800">{stats.thisMonth}</p>
          </div>
        </div>
      </div>

      {syncMessage && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-bold border ${
            syncMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {syncMessage.text}
        </div>
      )}

      {/* Search, Filter Lintas Tahun & Mode Tampilan */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-200 space-y-2.5">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleLimit(20);
            }}
            placeholder="Cari nama PT, nomor laporan, lokasi, atau ahli K3..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select
            value={filterYear}
            onChange={(e) => {
              setFilterYear(e.target.value);
              setVisibleLimit(20);
            }}
            className="px-2.5 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl"
          >
            <option value="all">Semua Tahun</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                Tahun {yr}
              </option>
            ))}
          </select>

          <select
            value={filterMonth}
            onChange={(e) => {
              setFilterMonth(e.target.value);
              setVisibleLimit(20);
            }}
            className="px-2.5 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl"
          >
            <option value="all">Semua Bulan</option>
            {MONTH_NAMES_ID.map((m, idx) => (
              <option key={m} value={String(idx)}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setVisibleLimit(20);
            }}
            className="px-2.5 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl"
          >
            <option value="all">Semua Tipe Alat</option>
            {availableTypes.map((tp) => (
              <option key={tp} value={tp}>
                {getTypeLabel(tp)}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setVisibleLimit(20);
            }}
            className="px-2.5 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl"
          >
            <option value="all">Semua Status</option>
            <option value="completed">Selesai</option>
            <option value="draft">Draf</option>
            <option value="generating">Proses</option>
            <option value="approved">Approved</option>
          </select>
        </div>

        {/* Mode Switcher + Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="inline-flex bg-gray-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setViewMode('byMonth')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                viewMode === 'byMonth' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              📅 Per Bulan
            </button>
            <button
              type="button"
              onClick={() => setViewMode('byClient')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                viewMode === 'byClient' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              🏢 Per Klien ({groupedByClient.length})
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-gray-500 font-semibold">
            <span>
              {viewMode === 'byMonth' && filteredReports.length > pagedReports.length
                ? `Menampilkan ${pagedReports.length} dari ${filteredReports.length} laporan`
                : `Menampilkan ${filteredReports.length} laporan`}
            </span>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-emerald-700 font-bold hover:underline"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="w-9 h-9 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500 font-bold">Memuat laporan...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-gray-200 p-6">
          <div className="text-4xl mb-3 opacity-50">📄</div>
          <h3 className="text-sm font-bold text-gray-700">
            {hasActiveFilter ? 'Tidak ada laporan yang cocok dengan filter' : 'Belum ada laporan'}
          </h3>
          <p className="text-xs text-gray-400 mt-1 max-w-sm">
            {hasActiveFilter
              ? 'Coba ubah kata kunci pencarian atau tekan Reset Filter.'
              : 'Laporan K3 yang dibuat di Desktop maupun HP akan muncul di sini setelah tersinkron.'}
          </p>
        </div>
      ) : viewMode === 'byMonth' ? (
        <div className="space-y-5">
          {groupedByMonth.map(([key, grp]) => (
            <div key={key} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-black uppercase tracking-wider text-gray-600">
                  {grp.label}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-[10px] font-bold">
                  {grp.items.length}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {grp.items.map(renderReportCard)}
              </div>
            </div>
          ))}

          {filteredReports.length > visibleLimit && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 20)}
                className="px-5 py-2.5 rounded-xl bg-white border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Tampilkan Lebih Banyak ({filteredReports.length - visibleLimit} lagi)
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {groupedByClient.map(([clientName, items]) => {
            const isOpen = openClients.has(clientName);
            return (
              <div key={clientName} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleClientGroup(clientName)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">🏢</span>
                    <span className="text-xs font-extrabold text-gray-900 truncate">{clientName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      {items.length} laporan
                    </span>
                    <span className="text-xs text-gray-500">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white border-t border-gray-100">
                    {items.map(renderReportCard)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
