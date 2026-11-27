// src/components/report/preview/GenericPaperMirror.tsx
import React from 'react';
import type { ReportPreviewData } from '../../../utils/reportTemplatePayload';
import {
  FolioPaperSheet,
  PaperHeaderBand,
  PaperSignatureBlock,
  PaperAppendices,
  TOSKA_MATI,
  TOSKA_SUBTLE,
} from './PaperMirrorShared';

interface GenericPaperMirrorProps {
  renderedData: Record<string, any>;
  previewData: ReportPreviewData;
  showMedia: boolean;
  apiBase: string;
}

/**
 * Fallback HTML Paper Mirror generik untuk tipe alat K3 baru di masa depan
 * (PAA, PUBT, PTP, Lift, Proteksi Kebakaran, dll.) sebelum memiliki mirror khusus.
 */
export function GenericPaperMirror({
  renderedData,
  previewData,
  showMedia,
  apiBase,
}: GenericPaperMirrorProps) {
  const code = String(previewData.inspectionTypeCode || 'K3').toUpperCase();
  const excludedTechKeys = new Set(['groundingPoints', 'driveFolderId']);
  const techEntries = Object.entries(previewData.technicalData || {}).filter(
    ([k, v]) => !excludedTechKeys.has(k) && v !== undefined && v !== null && String(v).trim() !== '' && typeof v !== 'object'
  );

  const checklistSections = Array.isArray(renderedData.checklistSections)
    ? renderedData.checklistSections
    : [];
  const calcs = Array.isArray(renderedData.calculations) ? renderedData.calculations : [];

  return (
    <div className="space-y-6">
      <FolioPaperSheet pageLabel={`Halaman Utama (${code})`}>
        <PaperHeaderBand
          title="LAPORAN PEMERIKSAAN DAN PENGUJIAN"
          subtitle={`OBJEK K3 : ${code}`}
          reportNumber={renderedData.reportNumber}
        />

        <table className="w-full mb-4 border-collapse" style={{ fontSize: '12px' }}>
          <tbody>
            {[
              ['Nama Perusahaan', renderedData.companyName],
              ['Alamat Perusahaan', renderedData.companyAddress],
              ['Perusahaan Pemeriksa', renderedData.inspectorCompany],
              ['Tanggal Pemeriksaan', renderedData.inspectionDate],
              ['Ahli K3 Pemeriksa', renderedData.inspectorName],
            ].map(([label, val]) => (
              <tr key={String(label)} className="border-b border-dotted border-slate-200">
                <td style={{ width: '195px', padding: '2px 4px' }}>{label}</td>
                <td style={{ width: '12px' }}>:</td>
                <td style={{ padding: '2px 4px', fontWeight: label === 'Nama Perusahaan' ? 'bold' : 'normal' }}>
                  {val || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {techEntries.length > 0 && (
          <>
            <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px', textDecoration: 'underline' }}>
              I. DATA UMUM &amp; TEKNIS
            </div>
            <table className="w-full mb-4 border-collapse" style={{ fontSize: '11.5px' }}>
              <tbody>
                {techEntries.map(([key, val], idx) => (
                  <tr key={key} className="border-b border-dotted border-slate-200">
                    <td style={{ width: '28px', padding: '2px 4px' }}>{idx + 1}.</td>
                    <td style={{ width: '215px', padding: '2px 4px' }}>
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                    </td>
                    <td style={{ width: '12px' }}>:</td>
                    <td style={{ padding: '2px 4px' }}>{String(val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {checklistSections.length > 0 && (
          <>
            <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '6px', textDecoration: 'underline' }}>
              II. DATA CHECK LIST PEMERIKSAAN
            </div>
            <table className="w-full border-collapse mb-4" style={{ fontSize: '11px', border: '1px solid #374151' }}>
              <thead>
                <tr style={{ backgroundColor: TOSKA_MATI, color: '#FFFFFF' }}>
                  <th style={{ border: '1px solid #374151', padding: '5px', width: '32px' }}>NO</th>
                  <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left' }}>OBYEK / ITEM</th>
                  <th style={{ border: '1px solid #374151', padding: '5px', width: '140px', textAlign: 'left' }}>HASIL</th>
                  <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left' }}>KETERANGAN / STANDAR</th>
                </tr>
              </thead>
              <tbody>
                {checklistSections.map((sec: any, sIdx: number) => (
                  <React.Fragment key={`gsec-wrap-${sIdx}`}>
                    <tr key={`gsec-${sIdx}`} style={{ backgroundColor: TOSKA_SUBTLE, fontWeight: 'bold' }}>
                      <td colSpan={4} style={{ border: '1px solid #374151', padding: '4px 6px' }}>
                        {sec.sectionTitle || sec.categoryName || `Bagian ${sIdx + 1}`}
                      </td>
                    </tr>
                    {(sec.items || []).map((it: any, iIdx: number) => (
                      <tr key={`git-${sIdx}-${iIdx}`}>
                        <td style={{ border: '1px solid #374151', padding: '3px 4px', textAlign: 'center' }}>{it.no ?? iIdx + 1}</td>
                        <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.obyek || it.description || '-'}</td>
                        <td style={{ border: '1px solid #374151', padding: '3px 6px', fontWeight: 'bold' }}>{it.hasil || it.result || '-'}</td>
                        <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.remarks || it.nilaiRujukan || it.standard || '-'}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </>
        )}

        {calcs.length > 0 && (
          <div className="mb-4">
            <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px', textDecoration: 'underline' }}>
              III. HASIL PERHITUNGAN &amp; EVALUASI
            </div>
            <ul className="list-disc pl-5 space-y-1" style={{ fontSize: '11.5px' }}>
              {calcs.map((c: any) => (
                <li key={c.formulaId}>
                  <strong>{c.formulaName}:</strong> {c.details || `${c.result} ${c.unit || ''}`} ({c.pass ? 'MEMENUHI' : 'PERLU PERBAIKAN'})
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2 mb-4" style={{ textAlign: 'justify' }}>
          {renderedData.executiveSummary && (
            <p><strong>Pemeriksaan:</strong> {renderedData.executiveSummary}</p>
          )}
          {renderedData.testResultsNarrative && (
            <p><strong>Pengujian:</strong> {renderedData.testResultsNarrative}</p>
          )}
          {renderedData.conclusion && (
            <p><strong>Kesimpulan:</strong> {renderedData.conclusion}</p>
          )}
          {renderedData.recommendations && (
            <p className="whitespace-pre-line"><strong>Saran / Syarat-Syarat:</strong>{'\n'}{renderedData.recommendations}</p>
          )}
        </div>

        <PaperSignatureBlock
          reportDateFormatted={renderedData.reportDate}
          inspectorRole="Ahli K3 Pemeriksa"
          inspectorName={renderedData.inspectorName}
          inspectorCertNumber={renderedData.inspectorCertNumber}
        />
      </FolioPaperSheet>

      <PaperAppendices
        gridPhotos={previewData.gridPhotos}
        jointPhoto={previewData.jointPhoto}
        bapAttachments={previewData.bapAttachments}
        skpPerusahaanImage={previewData.generalData.skpPerusahaanImage}
        skpAhliImage={previewData.generalData.skpAhliImage}
        extraAttachments={previewData.extraAttachments}
        showMedia={showMedia}
        apiBase={apiBase}
      />
    </div>
  );
}
