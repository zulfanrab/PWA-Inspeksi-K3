// src/components/report/preview/PaperMirrorShared.tsx
import React from 'react';
import type { PreviewPhotoItem, PreviewAttachmentItem } from '../../../utils/reportTemplatePayload';

export const TOSKA_MATI = '#135D66';
export const TOSKA_SUBTLE = '#E3F0F0';

export function FolioPaperSheet({
  children,
  pageLabel,
}: {
  children: React.ReactNode;
  pageLabel?: string;
}) {
  return (
    <div
      className="bg-white text-black shadow-md border border-slate-300 mx-auto relative"
      style={{
        width: '816px', // 215.9 mm (Folio/F4 width at 96 DPI)
        minHeight: '1120px',
        padding: '58px 66px',
        fontFamily: '"Times New Roman", Times, Georgia, serif',
        fontSize: '12.5px',
        lineHeight: 1.42,
        color: '#111827',
      }}
    >
      {pageLabel && (
        <span
          className="absolute top-3 right-5 text-[9px] font-sans uppercase tracking-wider text-slate-400 select-none"
        >
          {pageLabel}
        </span>
      )}
      {children}
    </div>
  );
}

export function PaperHeaderBand({ title, subtitle, reportNumber }: { title: string; subtitle: string; reportNumber: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between border-b-[2.5px] border-black pb-2 mb-3">
        <div className="flex items-center gap-2.5">
          <img
            src="/icons/icon-192.png"
            alt="ARP"
            className="w-11 h-11 object-contain"
          />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.4px', color: TOSKA_MATI }}>
              PT. AKSARA RIKSA PERDANA
            </div>
            <div style={{ fontSize: '10px', color: '#374151' }}>
              Perusahaan Jasa Keselamatan dan Kesehatan Kerja (PJK3) — Bidang Pemeriksaan &amp; Pengujian
            </div>
          </div>
        </div>
        <div style={{ fontSize: '10px', textAlign: 'right', color: '#4B5563' }}>
          <div>Bandung, Jawa Barat</div>
          <div>Riksa Uji K3 Resmi</div>
        </div>
      </div>

      <div className="text-center mb-3">
        <div style={{ fontSize: '14px', fontWeight: 'bold', textDecoration: 'underline', letterSpacing: '0.3px' }}>
          {title}
        </div>
        <div style={{ fontSize: '13.5px', fontWeight: 'bold', marginTop: '2px' }}>{subtitle}</div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '3px' }}>
          Nomor : {reportNumber || '.... / ARP / ... / ....'}
        </div>
      </div>
    </div>
  );
}

export function PaperSignatureBlock({
  reportDateFormatted,
  inspectorRole,
  inspectorName,
  inspectorCertNumber,
}: {
  reportDateFormatted: string;
  inspectorRole: string;
  inspectorName: string;
  inspectorCertNumber: string;
}) {
  return (
    <div className="flex justify-end mt-6">
      <div style={{ width: '270px', textAlign: 'center', fontSize: '12px', lineHeight: 1.45 }}>
        <div>Bandung, {reportDateFormatted || '-'}</div>
        <div style={{ fontWeight: 'bold' }}>PT. AKSARA RIKSA PERDANA</div>
        <div>{inspectorRole}</div>
        <div style={{ height: '54px' }} />
        <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          {inspectorName || '(Nama Ahli K3)'}
        </div>
        <div>{inspectorCertNumber || '(Nomor SKP / Registrasi)'}</div>
      </div>
    </div>
  );
}

export function PaperAppendices({
  gridPhotos,
  jointPhoto,
  bapAttachments,
  skpPerusahaanImage,
  skpAhliImage,
  extraAttachments,
  showMedia,
  apiBase,
}: {
  gridPhotos: PreviewPhotoItem[];
  jointPhoto?: PreviewPhotoItem | null;
  bapAttachments: PreviewAttachmentItem[];
  skpPerusahaanImage?: string;
  skpAhliImage?: string;
  extraAttachments: PreviewAttachmentItem[];
  showMedia: boolean;
  apiBase: string;
}) {
  const resolveSrc = (p?: PreviewPhotoItem | null) => {
    if (!p) return '';
    if (p.dataUrl) return p.dataUrl;
    if (p.driveFileId) return `${apiBase}/api/photo-proxy?fileId=${p.driveFileId}`;
    return '';
  };

  const rows: PreviewPhotoItem[][] = [];
  for (let i = 0; i < gridPhotos.length; i += 3) {
    rows.push(gridPhotos.slice(i, i + 3));
  }

  return (
    <>
      {/* 1. Dokumentasi Pemeriksaan & Foto Bersama */}
      {(rows.length > 0 || jointPhoto) && (
        <FolioPaperSheet pageLabel="Dokumentasi Foto">
          <div
            style={{
              fontWeight: 'bold',
              fontSize: '13px',
              textAlign: 'center',
              marginBottom: '12px',
              textTransform: 'uppercase',
            }}
          >
            DOKUMENTASI HASIL PEMERIKSAAN
          </div>

          {rows.length > 0 && (
            <table
              className="w-full border-collapse mb-5"
              style={{ border: '1px solid #374151', tableLayout: 'fixed' }}
            >
              <tbody>
                {rows.map((row, rIdx) => (
                  <React.Fragment key={rIdx}>
                    <tr>
                      {[0, 1, 2].map((colIdx) => {
                        const item = row[colIdx];
                        const src = item && showMedia ? resolveSrc(item) : '';
                        return (
                          <td
                            key={colIdx}
                            style={{
                              border: '1px solid #374151',
                              padding: '6px',
                              textAlign: 'center',
                              verticalAlign: 'middle',
                              height: '185px',
                            }}
                          >
                            {item ? (
                              src ? (
                                <img
                                  src={src}
                                  alt={item.caption}
                                  className="mx-auto object-contain"
                                  style={{ maxHeight: '172px', maxWidth: '100%' }}
                                />
                              ) : (
                                <div className="text-[10px] font-sans text-slate-400 italic py-10">
                                  [Foto {item.caption || rIdx * 3 + colIdx + 1}]
                                </div>
                              )
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      {[0, 1, 2].map((colIdx) => {
                        const item = row[colIdx];
                        return (
                          <td
                            key={colIdx}
                            style={{
                              border: '1px solid #374151',
                              padding: '4px 6px',
                              textAlign: 'center',
                              fontSize: '10.5px',
                              fontWeight: 'bold',
                              backgroundColor: '#F9FAFB',
                            }}
                          >
                            {item ? item.caption || `Dokumentasi ${rIdx * 3 + colIdx + 1}` : ''}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}

          {jointPhoto && (
            <div className="mt-4 text-center">
              <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '8px' }}>
                Dokumentasi bersama Pihak Perusahaan
              </div>
              <div className="border border-slate-300 p-2 inline-block">
                {showMedia && resolveSrc(jointPhoto) ? (
                  <img
                    src={resolveSrc(jointPhoto)}
                    alt="Foto Bersama"
                    className="mx-auto object-contain"
                    style={{ maxWidth: '520px', maxHeight: '390px' }}
                  />
                ) : (
                  <div className="px-16 py-12 text-xs font-sans text-slate-400 italic">
                    [Foto Bersama Pihak Perusahaan — {jointPhoto.caption || 'Terlampir'}]
                  </div>
                )}
              </div>
            </div>
          )}
        </FolioPaperSheet>
      )}

      {/* 2. Lampiran BAP (Berita Acara Pemeriksaan) - SEBELUM SKP */}
      {bapAttachments.map((att, idx) => (
        <FolioPaperSheet key={`bap-${idx}`} pageLabel={`BAP Hal. ${idx + 1}`}>
          <div style={{ fontWeight: 'bold', fontSize: '12px', textAlign: 'center', marginBottom: '10px' }}>
            LAMPIRAN BERITA ACARA PEMERIKSAAN (BAP) — {att.sourceFileName} (Hal. {att.pageNumber})
          </div>
          {showMedia && att.dataUrl ? (
            <img
              src={att.dataUrl}
              alt={`BAP ${idx + 1}`}
              className="mx-auto object-contain border border-slate-200"
              style={{ maxWidth: '100%', maxHeight: '940px' }}
            />
          ) : (
            <div className="border border-dashed border-slate-300 py-32 text-center text-xs font-sans text-slate-400">
              [Lampiran BAP: {att.sourceFileName} Hal. {att.pageNumber}]
            </div>
          )}
        </FolioPaperSheet>
      ))}

      {/* 3. SKP Perusahaan & SKP Ahli (Otomatis) */}
      {skpPerusahaanImage && (
        <FolioPaperSheet pageLabel="SKP PJK3 Perusahaan">
          {showMedia ? (
            <img
              src={skpPerusahaanImage}
              alt="SKP PJK3 Perusahaan"
              className="mx-auto object-contain"
              style={{ maxWidth: '100%', maxHeight: '960px' }}
            />
          ) : (
            <div className="border border-dashed border-slate-300 py-36 text-center text-xs font-sans text-slate-400">
              [Lampiran SKP PJK3 Perusahaan — Otomatis]
            </div>
          )}
        </FolioPaperSheet>
      )}

      {skpAhliImage && (
        <FolioPaperSheet pageLabel="SKP Ahli K3">
          {showMedia ? (
            <img
              src={skpAhliImage}
              alt="SKP Ahli K3"
              className="mx-auto object-contain"
              style={{ maxWidth: '100%', maxHeight: '960px' }}
            />
          ) : (
            <div className="border border-dashed border-slate-300 py-36 text-center text-xs font-sans text-slate-400">
              [Lampiran SKP Ahli K3 — Otomatis]
            </div>
          )}
        </FolioPaperSheet>
      )}

      {/* 4. Lampiran Tambahan Akhir (Setelah SKP) */}
      {extraAttachments.map((att, idx) => (
        <FolioPaperSheet key={`extra-${idx}`} pageLabel={`Lampiran Akhir ${idx + 1}`}>
          <div style={{ fontWeight: 'bold', fontSize: '12px', textAlign: 'center', marginBottom: '10px' }}>
            LAMPIRAN TAMBAHAN — {att.sourceFileName} (Hal. {att.pageNumber})
          </div>
          {showMedia && att.dataUrl ? (
            <img
              src={att.dataUrl}
              alt={`Lampiran ${idx + 1}`}
              className="mx-auto object-contain border border-slate-200"
              style={{ maxWidth: '100%', maxHeight: '940px' }}
            />
          ) : (
            <div className="border border-dashed border-slate-300 py-32 text-center text-xs font-sans text-slate-400">
              [Lampiran Akhir: {att.sourceFileName} Hal. {att.pageNumber}]
            </div>
          )}
        </FolioPaperSheet>
      ))}
    </>
  );
}
