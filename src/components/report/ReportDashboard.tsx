// src/components/report/ReportDashboard.tsx
import { useState, useEffect } from 'react';
import { db } from '../../db/db';

interface ReportDashboardProps {
  onNewReport: () => void;
  onEditReport: (reportId: number) => void;
  setCurrentView: (view: any) => void;
}

export function ReportDashboard({ onNewReport, onEditReport, setCurrentView }: ReportDashboardProps) {
  const [reports, setReports] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const allReports = await db.reports.toArray();
      // Urutkan dari yang terbaru
      allReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReports(allReports);
    } catch (err) {
      console.error('Gagal memuat daftar laporan:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteReport = async (id: number) => {
    if (confirm('Apakah Anda yakin ingin menghapus draf laporan ini?')) {
      await db.reports.delete(id);
      loadReports();
    }
  };

  const filteredReports = reports.filter(r => {
    if (filterStatus === 'all') return true;
    return r.status === filterStatus;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700 border-gray-200';
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
            <span>⚙️</span> Auto-Report Generation Engine
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Modul pembuat laporan otomatis berbasis template Word & narrative bertenaga Gemini AI.
          </p>
        </div>
        <button
          onClick={onNewReport}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-sm px-5 py-3 rounded-xl shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/25 active:scale-95 transition-all"
        >
          <span>➕</span> Buat Laporan Baru
        </button>
      </div>

      {/* Filter and Stats */}
      <div className="flex flex-wrap gap-2 items-center bg-gray-50/50 p-2.5 rounded-xl border border-gray-200/50">
        <span className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">Filter Status:</span>
        {['all', 'draft', 'in_review', 'ready', 'preview', 'approved', 'locked'].map((status) => (
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
            Laporan K3 yang Anda buat atau sedang diproses akan muncul di sini. Klik tombol di atas untuk memulai.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-2xl border border-gray-150 p-5 shadow-sm hover:shadow-md hover:border-gray-250 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${getStatusBadgeClass(report.status)}`}>
                    {getStatusLabel(report.status)}
                  </span>
                  <span className="text-[10px] text-gray-400 font-bold">
                    {new Date(report.createdAt).toLocaleDateString('id-ID', {
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
                    <span>⚡</span> Tipe: {report.inspectionTypeCode === 'IL' ? 'Instalasi Listrik' : 'Penyalur Petir'}
                  </p>
                  {report.technicalData?.namaPanel && (
                    <p className="text-[11px] text-gray-400 font-medium">
                      Unit: {report.technicalData.namaPanel}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditReport(report.id)}
                    className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 active:scale-95 transition-all"
                  >
                    {report.status === 'locked' ? 'Detail' : 'Edit Laporan'}
                  </button>
                  {report.generatedFileId && (
                    <a
                      href={`https://docs.google.com/document/d/${report.generatedFileId}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all flex items-center gap-1"
                    >
                      <span>📂</span> Google Docs
                    </a>
                  )}
                </div>
                
                {report.status !== 'locked' && (
                  <button
                    onClick={() => deleteReport(report.id)}
                    className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 p-1.5 rounded-lg hover:bg-rose-100 transition-all"
                    title="Hapus Laporan"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
