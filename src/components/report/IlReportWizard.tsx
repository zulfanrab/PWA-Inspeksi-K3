// src/components/report/IlReportWizard.tsx
import { useState, useEffect, useMemo } from 'react';
import {
  db,
  InspectorRepository,
  CompanySkpRepository,
  type InspectorProfile,
} from '../../db/db';
import { getConfigByCode } from '../../report-configs/registry';
import { PUIL_CROSS_SECTIONS } from '../../report-configs/instalasi-listrik/forms';
import {
  PUIL_2011_KHA_TABLE,
  lookupPuilKha,
  computeIlAnalysis,
  type IlAnalysisResult,
} from '../../report-configs/instalasi-listrik/formulas';
import { FormulaEngine } from '../../engines/FormulaEngine';
import { ImageCompressor } from '../../engines/ImageCompressor';
import { getApiBaseUrl } from '../../config';
import { registerBackInterceptor } from '../../utils/navigationGuard';
import {
  parseApiJson,
  formatTanggalHuruf,
  estimateJsonPayloadBytes,
} from '../../utils/reportHelpers';
import {
  AttachmentSectionCard,
  mapInitialAttachments,
  type AttachmentPageItem,
} from './AttachmentSectionCard';
import { ReportWorkspaceLayout } from './preview/ReportWorkspaceLayout';
import type { ReportPreviewData } from '../../utils/reportTemplatePayload';
import {
  DocumentationPhotoPicker,
  applyAiPhotoSuggestions,
  buildPhotoSelectionMeta,
  getJointDocPhoto,
  getOrderedDocPhotos,
  initDocPhotos,
  resolveDocPhotoDataUrl,
  type DocPhotoItemState,
} from './DocumentationPhotoPicker';

interface IlReportWizardProps {
  selectedInspection: any;
  reportId: number | null;
  initialReportData?: any;
  onChangeSource?: () => void;
  onClose: () => void;
}

const CHECKLIST_QUICK_RESULTS = [
  'Baik',
  'Sesuai',
  'Ada',
  'Kurang',
  'Tidak Ada',
  'Tidak berfungsi',
] as const;

const PROBLEM_RESULTS = new Set(['Kurang', 'Tidak Ada', 'Tidak berfungsi']);

function isChecklistItemFaulty(itemId: string, hasil: string): boolean {
  const clean = String(hasil || '').trim();
  if (!clean) return false;
  // Item 4.6 "Barang-barang yang tidak terpakai" -> Tidak Ada = baik, Ada = temuan
  if (itemId === '4.6') {
    return clean.toLowerCase() === 'ada' || clean.toLowerCase() === 'kurang';
  }
  return PROBLEM_RESULTS.has(clean);
}

function parseKvaNumber(raw: unknown): string {
  const match = String(raw || '').replace(/,/g, '.').match(/[0-9]+(\.[0-9]+)?/);
  return match ? match[0] : '';
}

function buildTestingMirrorMap(fd: Record<string, any>, analysis: IlAnalysisResult): Record<string, string> {
  const hasThermal =
    String(fd.suhuR ?? '').trim() !== '' ||
    String(fd.suhuS ?? '').trim() !== '' ||
    String(fd.suhuT ?? '').trim() !== '';
  const groundingRaw = String(fd.tahananPentanahan ?? '').trim();

  return {
    '5.1': fd.teganganKerja || `${analysis.teganganVolt} Volt`,
    '5.2': `R: ${analysis.arusR} A, S: ${analysis.arusS} A, T: ${analysis.arusT} A, N: ${fd.arusNetral || 0} A, PE: ${fd.arusPE || 0} A`,
    '5.3': analysis.groundingPass ? 'Baik / Terpasang' : 'Tidak Memenuhi / Perlu Perbaikan',
    '5.4': fd.susutTeganganStatus || 'Memenuhi (< 3% Daya, < 1,5% Penerangan)',
    '5.5': hasThermal
      ? `R: ${fd.suhuR || '-'} °C, S: ${fd.suhuS || '-'} °C, T: ${fd.suhuT || '-'} °C`
      : '-',
    '5.6': groundingRaw
      ? `${groundingRaw} Ω (${analysis.groundingPass ? 'Memenuhi <= 5 Ω' : 'Tidak Memenuhi > 5 Ω'})`
      : '-',
    '5.7': `${analysis.khaKabel} A >= ${analysis.khaHitung} A (${analysis.khaPass ? 'ACC' : 'TIDAK ACC'})`,
    '5.8':
      analysis.kapasitasProteksiNum > 0
        ? `${analysis.kapasitasProteksi} A >= ${analysis.ratingCbHitung} A (${analysis.proteksiPass ? 'ACC' : 'TIDAK ACC'})`
        : '-',
    '5.9': String(fd.dayaPeneranganAmp || '').trim()
      ? `${String(fd.dayaPeneranganAmp).replace(/\s*a$/i, '')} A`
      : fd.dayaPenerangan || '-',
    '5.10': String(fd.dayaAcAmp || '').trim()
      ? `${String(fd.dayaAcAmp).replace(/\s*a$/i, '')} A`
      : '-',
    '5.11': String(fd.dayaMesinAmp || '').trim()
      ? `${String(fd.dayaMesinAmp).replace(/\s*a$/i, '')} A`
      : fd.dayaTenaga || '-',
  };
}

export function IlReportWizard({
  selectedInspection,
  reportId,
  initialReportData,
  onChangeSource,
  onClose,
}: IlReportWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [showPuilTableModal, setShowPuilTableModal] = useState(false);
  const config = getConfigByCode('IL');
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    const unregister = registerBackInterceptor(() => {
      if (showOcrModal) {
        setShowOcrModal(false);
        return true;
      }
      if (showPuilTableModal) {
        setShowPuilTableModal(false);
        return true;
      }
      if (step > 1) {
        setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev));
        return true;
      }
      if (confirm('Tutup wizard laporan Instalasi Listrik? Perubahan yang belum disimpan akan hilang.')) {
        onClose();
      }
      return true;
    });
    return unregister;
  }, [step, showOcrModal, showPuilTableModal, onClose]);

  useEffect(() => {
    if (!showOcrModal && !showPuilTableModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowOcrModal(false);
        setShowPuilTableModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showOcrModal, showPuilTableModal]);

  // --- INSPECTORS & COMPANY SKP ---
  const [inspectors, setInspectors] = useState<InspectorProfile[]>([]);
  const [selectedInspectorId, setSelectedInspectorId] = useState<string>('');
  const [syncingInspectors, setSyncingInspectors] = useState(false);
  const [companySkpImage, setCompanySkpImage] = useState<string>(
    initialReportData?.generalData?.skpPerusahaanImage || ''
  );

  // --- STEP 1: DATA UMUM ACCORDION ---
  const [openAccordion, setOpenAccordion] = useState<'umum_identitas' | 'umum_daya' | 'umum_listrik'>('umum_identitas');
  const [reportNumber, setReportNumber] = useState<string>(initialReportData?.reportNumber || '');
  const [autoNumberLoading, setAutoNumberLoading] = useState(false);

  const unitData = selectedInspection?.unitData || {};
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const rawSysVolt = String(unitData.teganganSistem || '');
    const is1PhaseInit =
      String(unitData.jumlahPhasa || '').toLowerCase().includes('1') ||
      rawSysVolt.includes('1 Phase');
    const initDayaNum =
      unitData.dayaTerpasangKva ?? (parseKvaNumber(unitData.dayaTerpasang) || '16.5');
    const initMm2 = String(unitData.luasPenampangMm2 || '10');
    const initCore = String(unitData.jumlahIntiKabel || '3-4');
    const initInst = String(unitData.instalasiKabel || 'Di Udara');
    const initKha = unitData.khaKabel ?? lookupPuilKha(initMm2, initCore, initInst) ?? 60;

    const base: Record<string, any> = {
      companyName: selectedInspection?.clientName || '',
      companyAddress: unitData.alamatPerusahaan || unitData.lokasiUnit || '',
      inspectionDate: unitData.tanggal_inspeksi || selectedInspection?.tanggal_inspeksi || todayIso,
      reportDate: todayIso,

      // 12 Data Umum resmi Template_IL-v1.docx
      instalatirPemasang: unitData.instalatirPemasang || '-',
      sumberTegangan: unitData.sumberTegangan || 'PLN',
      sumberDayaListrik:
        unitData.sumberDayaListrik || (initDayaNum ? `${initDayaNum} kVA` : ''),
      dayaPenerangan: unitData.dayaPenerangan || '',
      dayaTenaga: unitData.dayaTenaga || '',
      jumlahPhasa: is1PhaseInit ? '1 Phase' : unitData.jumlahPhasa || '3 Phase',
      frekuensi: unitData.frekuensi || '50 Hz',
      jenisArus: unitData.jenisArus || 'AC (Alternating Current)',
      teganganKerja:
        unitData.teganganKerja || (is1PhaseInit ? '220 Volt' : '220 / 380 Volt'),
      lokasiPanel: unitData.lokasiPanel || unitData.lokasiUnit || unitData.namaUnit || '',

      // Input Analisis & Pengujian PUIL 2011
      dayaTerpasangKva: initDayaNum,
      teganganVolt: unitData.teganganVolt ?? (is1PhaseInit ? 220 : 380),
      cosPhi: unitData.cosPhi ?? 0.8,
      jenisKabel: unitData.jenisKabel || 'NYY',
      ukuranKabel: unitData.ukuranKabel || '4 x (1 x 10) mm2',
      luasPenampangMm2: initMm2,
      jumlahIntiKabel: initCore,
      instalasiKabel: initInst,
      khaKabel: initKha,
      jenisProteksi: unitData.jenisProteksi || unitData.jenisProteksiUtama || 'MCCB',
      kapasitasProteksi: unitData.kapasitasProteksi ?? unitData.ratingProteksiUtama ?? '',

      // Pengukuran Beban, Suhu & Pentanahan
      arusR: unitData.arusR ?? unitData.bebanR ?? 0,
      arusS: unitData.arusS ?? unitData.bebanS ?? 0,
      arusT: unitData.arusT ?? unitData.bebanT ?? 0,
      arusNetral: unitData.arusNetral ?? 0,
      arusPE: unitData.arusPE ?? 0,
      suhuR: unitData.suhuR ?? '',
      suhuS: unitData.suhuS ?? '',
      suhuT: unitData.suhuT ?? '',
      tahananPentanahan: unitData.tahananPentanahan ?? unitData.nilaiGrounding ?? '',
      dayaPeneranganAmp: unitData.dayaPeneranganAmp ?? '',
      dayaAcAmp: unitData.dayaAcAmp ?? '',
      dayaMesinAmp: unitData.dayaMesinAmp ?? '',
      susutTeganganStatus: unitData.susutTeganganStatus || 'Memenuhi (< 3% Daya, < 1,5% Penerangan)',
    };

    if (initialReportData) {
      const merged = {
        ...base,
        ...(initialReportData.generalData || {}),
        ...(initialReportData.technicalData || {}),
      };
      if (!merged.inspectionDate) merged.inspectionDate = todayIso;
      if (!merged.reportDate) merged.reportDate = todayIso;
      return merged;
    }
    return base;
  });

  // Real-time PUIL 2011 computation
  const analysis = useMemo(() => computeIlAnalysis(formData), [formData]);

  // --- STEP 2: CHECKLIST 5 KATEGORI + TABEL 2.5 MODAL ---
  const [editedTestingRows, setEditedTestingRows] = useState<Record<string, boolean>>(() => {
    const edited: Record<string, boolean> = {};
    if (initialReportData?.checklistData?.checklistSections) {
      const mirror = buildTestingMirrorMap(formData, analysis);
      initialReportData.checklistData.checklistSections.forEach((sec: any) => {
        (sec.items || []).forEach((it: any) => {
          if (it.itemId && String(it.itemId).startsWith('5.') && it.hasil !== undefined) {
            if (String(it.hasil) !== (mirror[it.itemId] ?? '')) {
              edited[it.itemId] = true;
            }
          }
        });
      });
    }
    return edited;
  });
  const [checklistResults, setChecklistResults] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (config) {
      config.checklists.categories.forEach((cat) =>
        cat.components.forEach((comp) =>
          comp.items.forEach((item) => {
            if (cat.categoryId === 'pengujian') {
              map[item.itemId] = '-';
            } else if (item.itemId === '4.6') {
              map[item.itemId] = 'Tidak Ada';
            } else if (cat.categoryId === 'daerah_kerja') {
              map[item.itemId] = 'Sesuai';
            } else {
              map[item.itemId] = 'Baik';
            }
          })
        )
      );
    }

    if (initialReportData?.checklistData?.checklistSections) {
      initialReportData.checklistData.checklistSections.forEach((sec: any) => {
        (sec.items || []).forEach((it: any) => {
          if (it.itemId && it.hasil !== undefined) {
            map[it.itemId] = String(it.hasil);
          } else if (it.obyek && config) {
            for (const cat of config.checklists.categories) {
              for (const comp of cat.components) {
                const matched = comp.items.find((cfgIt) => cfgIt.description === it.obyek);
                if (matched && it.hasil !== undefined) {
                  map[matched.itemId] = String(it.hasil);
                }
              }
            }
          }
        });
      });
    } else if (Array.isArray(initialReportData?.checklistData?.components)) {
      initialReportData.checklistData.components.forEach((comp: any) => {
        (comp.items || []).forEach((it: any) => {
          if (it.itemId && (it.hasil !== undefined || it.result !== undefined)) {
            map[it.itemId] = String(it.hasil ?? it.result);
          }
        });
      });
    }
    return map;
  });

  // Auto-mirror Category 5 (Pengujian) from Step 2 measurement/formula inputs
  useEffect(() => {
    const mirror = buildTestingMirrorMap(formData, analysis);
    setChecklistResults((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(mirror).forEach(([itemId, val]) => {
        if (!editedTestingRows[itemId] && next[itemId] !== val) {
          next[itemId] = val;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [formData, analysis, editedTestingRows]);

  // --- STEP 3: NARASI, SYARAT-SYARAT, FOTO, LAMPIRAN ---
  const [visualSummary, setVisualSummary] = useState<string>(
    initialReportData?.aiNarrative?.sections?.visualSummary || ''
  );
  const [testingSummary, setTestingSummary] = useState<string>(
    initialReportData?.aiNarrative?.sections?.testingSummary || ''
  );
  const [conclusion, setConclusion] = useState<string>(
    initialReportData?.aiNarrative?.sections?.conclusion || ''
  );
  const [recommendations, setRecommendations] = useState<string>(
    initialReportData?.aiNarrative?.sections?.recommendations || ''
  );
  const [closingNote, setClosingNote] = useState<string>(
    initialReportData?.aiNarrative?.sections?.closingNote || ''
  );

  const [photos, setPhotos] = useState<DocPhotoItemState[]>(() =>
    initDocPhotos(selectedInspection?.photos || [], initialReportData)
  );

  // --- LAMPIRAN BAP (SEBELUM SKP) & LAMPIRAN TAMBAHAN (SETELAH SKP) ---
  const [bapAttachments, setBapAttachments] = useState<AttachmentPageItem[]>(() =>
    mapInitialAttachments(initialReportData?.bapAttachments, 'bap')
  );
  const [extraAttachments, setExtraAttachments] = useState<AttachmentPageItem[]>(() =>
    mapInitialAttachments(initialReportData?.extraAttachments, 'extra')
  );

  // --- AI & EXPORT STATES ---
  const [ocrLoading, setOcrLoading] = useState(false);
  const [aiNarrativeLoading, setAiNarrativeLoading] = useState(false);
  const [aiPhotoLoading, setAiPhotoLoading] = useState(false);
  const [qcLoading, setQcLoading] = useState(false);
  const [qcNotes, setQcNotes] = useState<string | null>(null);

  const [exportingFormat, setExportingFormat] = useState<'docx' | 'pdf' | null>(null);
  const [exportResult, setExportResult] = useState<{
    docxFileId?: string;
    pdfFileId?: string;
    message?: string;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // --- LOAD INSPECTORS & COMPANY SKP ---
  useEffect(() => {
    let cancelled = false;
    const initInspectors = async () => {
      let [list, localSkp] = await Promise.all([
        InspectorRepository.getAll(),
        CompanySkpRepository.getSkpImage(),
      ]);
      if (cancelled) return;
      if (list.length === 0 || !localSkp) {
        try {
          const res = await fetch(`${apiBase}/api/report?action=inspectors`);
          const data = await parseApiJson(res);
          if (cancelled) return;
          if (data.success) {
            if (Array.isArray(data.inspectors) && data.inspectors.length > 0 && list.length === 0) {
              await InspectorRepository.replaceAllFromSync(data.inspectors);
              list = await InspectorRepository.getAll();
            }
            if (typeof data.companySkpImage === 'string' && data.companySkpImage && !localSkp) {
              await CompanySkpRepository.saveSkpImage(data.companySkpImage);
              localSkp = data.companySkpImage;
            }
          }
        } catch {
          // ignore offline
        }
      }
      if (cancelled) return;
      if (localSkp) {
        setCompanySkpImage((prev) => prev || localSkp);
      }
      setInspectors(list);
      if (list.length > 0) {
        setSelectedInspectorId((prev) => {
          if (prev) return prev;
          const matched = initialReportData?.generalData?.inspectorName
            ? list.find((i) => i.name === initialReportData.generalData.inspectorName)
            : list[0];
          return matched ? matched.id : '';
        });
      }
    };
    initInspectors();
    return () => {
      cancelled = true;
    };
  }, [apiBase, initialReportData]);

  const handleSyncInspectors = async () => {
    setSyncingInspectors(true);
    try {
      const res = await fetch(`${apiBase}/api/report?action=inspectors`);
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.inspectors)) {
          await InspectorRepository.replaceAllFromSync(data.inspectors);
          const updated = await InspectorRepository.getAll();
          setInspectors(updated);
          if (updated.length > 0 && !selectedInspectorId) {
            setSelectedInspectorId(updated[0].id);
          }
        }
        if (typeof data.companySkpImage === 'string') {
          if (data.companySkpImage) {
            await CompanySkpRepository.saveSkpImage(data.companySkpImage);
          }
          setCompanySkpImage(data.companySkpImage);
        }
      }
    } catch (err: any) {
      alert(`Gagal sinkronisasi Master Ahli K3 & SKP: ${err.message}`);
    } finally {
      setSyncingInspectors(false);
    }
  };

  const handleAutoNumber = async () => {
    setAutoNumberLoading(true);
    try {
      const refDate = formData.reportDate ? new Date(`${formData.reportDate}T00:00:00+07:00`) : new Date();
      const year = isNaN(refDate.getTime()) ? new Date().getFullYear() : refDate.getFullYear();
      const month = isNaN(refDate.getTime()) ? new Date().getMonth() + 1 : refDate.getMonth() + 1;

      const res = await fetch(`${apiBase}/api/report?action=sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionTypeCode: 'IL', year, month }),
      });
      const data = await parseApiJson(res);
      if (!res.ok || !data.success || !data.fullReportNumber) {
        throw new Error(data.error || 'Gagal mengambil nomor urut otomatis.');
      }
      setReportNumber(data.fullReportNumber);
    } catch (err: any) {
      alert(`Auto Nomor gagal: ${err.message}. Silakan ketik nomor laporan secara manual.`);
    } finally {
      setAutoNumberLoading(false);
    }
  };

  const selectedInspector = useMemo(
    () => inspectors.find((i) => i.id === selectedInspectorId) || null,
    [inspectors, selectedInspectorId]
  );

  // Field change handler with smart PUIL KHA auto-lookup & kVA sync
  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [fieldId]: value };

      if (fieldId === 'sumberDayaListrik') {
        const parsed = parseKvaNumber(value);
        if (parsed) next.dayaTerpasangKva = parsed;
      } else if (fieldId === 'dayaTerpasangKva' && !String(prev.sumberDayaListrik || '').trim()) {
        if (String(value).trim()) next.sumberDayaListrik = `${value} kVA`;
      } else if (fieldId === 'jumlahPhasa') {
        const is1Ph = String(value).includes('1');
        if (is1Ph && Number(prev.teganganVolt) === 380) next.teganganVolt = 220;
        if (!is1Ph && Number(prev.teganganVolt) === 220) next.teganganVolt = 380;
        if (is1Ph && prev.teganganKerja === '220 / 380 Volt') next.teganganKerja = '220 Volt';
        if (!is1Ph && prev.teganganKerja === '220 Volt') next.teganganKerja = '220 / 380 Volt';
      }

      if (
        fieldId === 'luasPenampangMm2' ||
        fieldId === 'jumlahIntiKabel' ||
        fieldId === 'instalasiKabel'
      ) {
        const lookedUp = lookupPuilKha(
          next.luasPenampangMm2 || '10',
          next.jumlahIntiKabel || '3-4',
          next.instalasiKabel || 'Di Udara'
        );
        next.khaKabel = lookedUp !== null ? lookedUp : '';
      }

      return next;
    });
  };

  // --- COLLECT CHECKLIST FAULTS ---
  const checklistFaults = useMemo(() => {
    const faults: string[] = [];
    config?.checklists.categories.forEach((cat) => {
      if (cat.categoryId === 'pengujian') return;
      cat.components.forEach((comp) =>
        comp.items.forEach((it) => {
          const val = checklistResults[it.itemId] || '';
          if (isChecklistItemFaulty(it.itemId, val)) {
            faults.push(`${it.description} (${val})`);
          }
        })
      );
    });
    return faults;
  }, [config, checklistResults]);

  // --- TEMPLATE NARASI BAKU IL (UU 1/1970, PERMENAKER 12/2015 & 33/2015, PUIL 2011) ---
  const buildDefaultNarratives = () => {
    const company = formData.companyName || 'Perusahaan';
    const lokasi = formData.lokasiPanel || 'Panel LVMDP/SDP';
    const allFormulaPass =
      analysis.khaPass &&
      (analysis.kapasitasProteksiNum <= 0 || analysis.proteksiPass) &&
      analysis.unbalancePass &&
      analysis.groundingPass;

    const visualText =
      checklistFaults.length === 0
        ? `Pemeriksaan dokumen teknis dan pemeriksaan visual terhadap Panel Hubung Bagi (${lokasi}) di ${company} yang meliputi bagian tampak luar PHB, tampak dalam PHB, sistem terminasi, serta daerah kerja panel secara umum dalam kondisi baik, bersih, rapi, dan sesuai ketentuan keselamatan kerja listrik (PUIL 2011).`
        : `Pemeriksaan visual pada Panel Hubung Bagi (${lokasi}) di ${company} secara umum berjalan baik, namun ditemukan beberapa catatan ketidaksesuaian pada komponen berikut: ${checklistFaults.join('; ')}.`;

    const testingText =
      `Pengujian kelistrikan pada ${lokasi} menghasilkan arus beban terukur R = ${analysis.arusR} A, S = ${analysis.arusS} A, T = ${analysis.arusT} A dengan ketidakseimbangan beban (I unbalance) sebesar ${analysis.unbalancePercent}% (${analysis.unbalancePass ? 'MEMENUHI batas < 20%' : 'MELEBIHI batas >= 20%'}). ` +
      `Evaluasi kapasitas penghantar utama (${analysis.jenisKabel} ${analysis.ukuranKabel}) memiliki KHA ${analysis.khaKabel} A dibandingkan kebutuhan 125% × In sebesar ${analysis.khaHitung} A (${analysis.khaPass ? 'ACC' : 'TIDAK ACC'}), dan proteksi utama ${analysis.jenisProteksi} ${analysis.kapasitasProteksi} A terhadap batas 115% × In sebesar ${analysis.ratingCbHitung} A (${analysis.proteksiPass ? 'ACC' : 'BELUM ACC'}). ` +
      (String(formData.tahananPentanahan || '').trim()
        ? `Nilai tahanan pentanahan terukur ${formData.tahananPentanahan} Ω (${analysis.groundingPass ? 'MEMENUHI SNI max 5 Ω' : 'MELEBIHI batas 5 Ω'}).`
        : '');

    const concText =
      allFormulaPass && checklistFaults.length === 0
        ? `Berdasarkan hasil pemeriksaan visual, pengukuran teknis, dan analisis perhitungan sesuai PUIL 2011, Instalasi Listrik pada ${lokasi} di ${company} dinyatakan MEMENUHI SYARAT KESELAMATAN DAN KESEHATAN KERJA (LAIK OPERASI) mengacu pada UU No. 1 Tahun 1970, Permenaker No. 12 Tahun 2015, dan Permenaker RI No. 33 Tahun 2015.`
        : `Berdasarkan hasil pemeriksaan visual dan pengujian teknis pada ${lokasi} di ${company}, Instalasi Listrik dinyatakan BELUM SEPENUHNYA MEMENUHI SYARAT K3 dan memerlukan tindak lanjut perbaikan sesuai ketentuan Permenaker No. 12 Tahun 2015 jo. Permenaker No. 33 Tahun 2015 serta PUIL 2011.`;

    const recList: string[] = [];
    if (checklistFaults.length > 0) {
      recList.push(`Segera lengkapi/perbaiki temuan pemeriksaan visual: ${checklistFaults.join('; ')}.`);
    }
    if (!analysis.khaPass) {
      recList.push(`Sesuaikan ukuran penghantar utama agar KHA kabel minimal >= ${analysis.khaHitung} A (125% × In) sesuai PUIL 2011.`);
    }
    if (analysis.kapasitasProteksiNum > 0 && !analysis.proteksiPass) {
      recList.push(`Sesuaikan kapasitas gawai proteksi utama (${analysis.jenisProteksi}) minimal >= ${analysis.ratingCbHitung} A (115% × In).`);
    }
    if (!analysis.unbalancePass) {
      recList.push(`Lakukan penyeimbangan distribusi beban antar phasa R, S, dan T agar nilai I unbalance di bawah 20%.`);
    }
    if (!analysis.groundingPass) {
      recList.push(`Perbaiki sistem pembumian panel hingga nilai tahanan pentanahan <= 5 Ω sesuai SNI/PUIL 2011.`);
    }
    recList.push(
      'Lakukan pemeliharaan berkala meliputi pembersihan bagian dalam panel, pengecekan kekencangan baut terminasi/busbar, serta pemantauan suhu penghantar dan beban phasa R-S-T.'
    );
    recList.push(
      'Laksanakan pemeriksaan dan pengujian ulang (riksa uji berkala) paling lambat 1 (satu) tahun sekali sesuai Permenaker No. 12 Tahun 2015 jo. Permenaker No. 33 Tahun 2015.'
    );

    const recText = recList.map((r, i) => `${i + 1}. ${r}`).join('\n');
    const noteText =
      'Agar syarat-syarat keselamatan kerja listrik tersebut dilaksanakan dan dijaga konsistensinya demi mencegah bahaya sentuh langsung, tidak langsung, maupun bahaya kebakaran akibat listrik.';

    return { visualText, testingText, concText, recText, noteText };
  };

  useEffect(() => {
    if (
      step === 3 &&
      !visualSummary &&
      !testingSummary &&
      !conclusion &&
      !recommendations
    ) {
      const def = buildDefaultNarratives();
      setVisualSummary(def.visualText);
      setTestingSummary(def.testingText);
      setConclusion(def.concText);
      setRecommendations(def.recText);
      if (!closingNote) setClosingNote(def.noteText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleSetCategoryAllGood = (categoryId: string) => {
    const cat = config?.checklists.categories.find((c) => c.categoryId === categoryId);
    if (!cat) return;
    setChecklistResults((prev) => {
      const next = { ...prev };
      cat.components.forEach((comp) =>
        comp.items.forEach((item) => {
          if (item.itemId === '4.6') {
            next[item.itemId] = 'Tidak Ada';
          } else if (categoryId === 'daerah_kerja') {
            next[item.itemId] = 'Sesuai';
          } else {
            next[item.itemId] = 'Baik';
          }
        })
      );
      return next;
    });
  };

  // --- HELPER FOTO ---
  const resolvePhotoDataUrl = async (p: DocPhotoItemState): Promise<string> =>
    resolveDocPhotoDataUrl(p, apiBase);

  // --- AI VISION OCR CLAMP METER / THERMOGRAF ---
  const handleRunOcrOnPhoto = async (photo: DocPhotoItemState) => {
    setOcrLoading(true);
    try {
      const rawUrl = await resolvePhotoDataUrl(photo);
      if (!rawUrl) throw new Error('Foto tidak tersedia.');
      const compressed = await ImageCompressor.compress(rawUrl, 1024, 0.85);
      const res = await fetch(`${apiBase}/api/report?action=vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'ocr_meter',
          inspectionType: 'IL',
          imageDataUrl: compressed,
        }),
      });
      const data = await parseApiJson(res);
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal membaca foto alat ukur.');

      const d = data.data || {};
      const updates: Record<string, any> = {};
      if (d.arusR !== undefined && d.arusR !== '') updates.arusR = d.arusR;
      if (d.arusS !== undefined && d.arusS !== '') updates.arusS = d.arusS;
      if (d.arusT !== undefined && d.arusT !== '') updates.arusT = d.arusT;
      if (d.teganganVolt !== undefined && d.teganganVolt !== '') updates.teganganVolt = d.teganganVolt;
      if (d.suhuR !== undefined && d.suhuR !== '') updates.suhuR = d.suhuR;
      if (d.suhuS !== undefined && d.suhuS !== '') updates.suhuS = d.suhuS;
      if (d.suhuT !== undefined && d.suhuT !== '') updates.suhuT = d.suhuT;
      if (d.tahananPentanahan !== undefined && d.tahananPentanahan !== '') {
        updates.tahananPentanahan = String(d.tahananPentanahan);
      } else if (d.resistanceValue !== undefined && d.resistanceValue !== '') {
        updates.tahananPentanahan = String(d.resistanceValue);
      }

      if (Object.keys(updates).length > 0) {
        setFormData((prev) => ({ ...prev, ...updates }));
        alert(`Hasil pembacaan AI berhasil diterapkan (${Object.keys(updates).join(', ')}).`);
      } else {
        alert('Tidak ada angka clamp meter / thermograf yang terbaca jelas dari foto.');
      }
      setShowOcrModal(false);
    } catch (err: any) {
      alert(`AI Vision OCR gagal: ${err.message}`);
    } finally {
      setOcrLoading(false);
    }
  };

  // --- AI POLES NARASI (IL) ---
  const handlePolishNarrativeWithAI = async () => {
    if (!config) return;
    setAiNarrativeLoading(true);
    try {
      const contextText = `DATA LAPORAN INSTALASI LISTRIK (IL):
- Pemilik: ${formData.companyName}
- Lokasi Panel: ${formData.lokasiPanel}
- Sumber Daya: ${formData.sumberTegangan}, ${formData.sumberDayaListrik}, ${formData.jumlahPhasa}, ${formData.teganganKerja}
- Analisis Arus Nominal (In): ${analysis.arusNominal} A
- KHA Kabel (${analysis.jenisKabel} ${analysis.ukuranKabel}, ${analysis.instalasiKabel}): ${analysis.khaKabel} A vs 125% In = ${analysis.khaHitung} A -> ${analysis.khaPass ? 'ACC' : 'TIDAK ACC'}
- Proteksi Utama (${analysis.jenisProteksi}): ${analysis.kapasitasProteksi} A vs 115% In = ${analysis.ratingCbHitung} A -> ${analysis.proteksiPass ? 'ACC' : 'TIDAK ACC'}
- Beban Phasa R/S/T: ${analysis.arusR} A / ${analysis.arusS} A / ${analysis.arusT} A (Unbalance: ${analysis.unbalancePercent}% -> ${analysis.unbalancePass ? 'ACC < 20%' : 'TIDAK ACC >= 20%'})
- Suhu R/S/T: ${formData.suhuR || '-'}°C / ${formData.suhuS || '-'}°C / ${formData.suhuT || '-'}°C
- Tahanan Pentanahan: ${formData.tahananPentanahan || '-'} Ω (${analysis.groundingPass ? 'Memenuhi <= 5 Ω' : 'Tidak Memenuhi > 5 Ω'})
- Temuan Checklist: ${checklistFaults.length > 0 ? checklistFaults.join('; ') : 'Semua komponen baik dan sesuai'}
- Draf saat ini:
  PEMERIKSAAN: ${visualSummary}
  PENGUJIAN: ${testingSummary}
  KESIMPULAN: ${conclusion}
  SYARAT-SYARAT: ${recommendations}`;

      const res = await fetch(`${apiBase}/api/report?action=narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelTier: 'pro',
          systemPrompt: `${config.aiPrompts.systemPrompt}\n\n${contextText}`,
          prompts: {
            executiveSummary: 'Poles narasi bagian PEMERIKSAAN (visual panel luar, dalam, terminasi, daerah kerja) agar padat, baku Disnaker, dan objektif.',
            findings: 'Ringkas temuan visual checklist bila ada.',
            testResults: 'Poles narasi bagian PENGUJIAN (beban RST, unbalance, suhu, pentanahan, KHA kabel, rating CB) tanpa mengubah angka.',
            recommendations: 'Poles poin SYARAT - SYARAT mengacu UU No. 1/1970, Permenaker 12/2015, Permenaker 33/2015, dan PUIL 2011.',
            conclusion: 'Poles KESIMPULAN akhir kelayakan instalasi listrik sesuai status deterministik pada konteks.',
          },
        }),
      });
      const data = await parseApiJson(res);
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal memoles narasi AI.');
      const d = data.data || {};
      if (d.executiveSummary) setVisualSummary(d.executiveSummary);
      if (d.testResultsNarrative) setTestingSummary(d.testResultsNarrative);
      if (d.conclusion) setConclusion(d.conclusion);
      if (d.recommendations) setRecommendations(d.recommendations);
    } catch (err: any) {
      alert(`Gagal memoles narasi: ${err.message}`);
    } finally {
      setAiNarrativeLoading(false);
    }
  };

  // --- AI AUTO-SORTIR & CAPTION FOTO ---
  const handleAutoCategorizePhotos = async () => {
    if (photos.length === 0) return;
    setAiPhotoLoading(true);
    try {
      const sample = photos.slice(0, 9);
      const compressedList = await Promise.all(
        sample.map(async (p) => ({
          id: p.id,
          dataUrl: await ImageCompressor.compress(await resolvePhotoDataUrl(p), 640, 0.7),
        }))
      );
      const res = await fetch(`${apiBase}/api/report?action=vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'categorize_photos',
          photos: compressedList,
          context: {
            inspectionType: 'IL',
            lokasiPanel: formData.lokasiPanel,
            arusR: analysis.arusR,
            arusS: analysis.arusS,
            arusT: analysis.arusT,
            tahananPentanahan: formData.tahananPentanahan,
          },
        }),
      });
      const data = await parseApiJson(res);
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menyusun foto otomatis.');
      const items: Array<{ id: string; caption: string; isJointPhoto?: boolean }> = data.data?.items || [];
      setPhotos((prev) => applyAiPhotoSuggestions(prev, items));
    } catch (err: any) {
      alert(`Gagal menyusun foto otomatis: ${err.message}`);
    } finally {
      setAiPhotoLoading(false);
    }
  };

  // --- PRE-FLIGHT QC ---
  const missingFields = useMemo(() => {
    const keys: Array<{ key: string; label: string }> = [
      { key: 'companyName', label: 'Pemilik / Nama Perusahaan' },
      { key: 'companyAddress', label: 'Alamat Perusahaan' },
      { key: 'sumberDayaListrik', label: 'Sumber Daya Listrik' },
      { key: 'lokasiPanel', label: 'Lokasi Panel' },
      { key: 'dayaTerpasangKva', label: 'Daya Terpasang (kVA)' },
      { key: 'kapasitasProteksi', label: 'Kapasitas Proteksi (A)' },
    ];
    return keys.filter((k) => !String(formData[k.key] ?? '').trim());
  }, [formData]);

  const handleRunPreFlightQc = async () => {
    setQcLoading(true);
    setQcNotes(null);
    try {
      const res = await fetch(`${apiBase}/api/report?action=vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'preflight_qc',
          payload: {
            inspectionType: 'IL',
            formData,
            analysis,
            visualSummary,
            testingSummary,
            conclusion,
            recommendations,
          },
        }),
      });
      const data = await parseApiJson(res);
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menjalankan QC.');
      setQcNotes(data.data?.summary || 'Tidak ditemukan kontradiksi data.');
    } catch (err: any) {
      setQcNotes(`QC AI tidak tersedia: ${err.message}`);
    } finally {
      setQcLoading(false);
    }
  };

  // --- EXPORT WORD / PDF ---
  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!reportNumber.trim()) {
      alert('Mohon isi Nomor Laporan terlebih dahulu di Langkah 1 (ketik manual atau tekan Auto Nomor).');
      setStep(1);
      return;
    }

    setExportingFormat(format);
    setExportError(null);
    setExportResult(null);

    try {
      const calcResult = FormulaEngine.calculate('IL', formData);

      // Susun 5 checklistSections untuk Template_IL-v1.docx:
      // { sectionTitle, items: [{ itemId, no, obyek, hasil, nilaiRujukan, metode }] }
      const checklistSections: any[] = [];
      const componentsForDb: any[] = [];

      config?.checklists.categories.forEach((cat) => {
        const sectionItems: any[] = [];
        let seqNo = 1;
        cat.components.forEach((comp) => {
          const compItems: any[] = [];
          comp.items.forEach((item) => {
            const hasil = checklistResults[item.itemId] ?? '-';
            const row = {
              itemId: item.itemId,
              no: seqNo++,
              obyek: item.description,
              hasil,
              nilaiRujukan: item.standard || '-',
              metode: item.method || 'Penilaian',
              description: item.description,
              result: hasil,
            };
            sectionItems.push(row);
            compItems.push(row);
          });
          componentsForDb.push({
            componentId: comp.componentId,
            componentName: comp.componentName,
            category: cat.categoryName,
            items: compItems,
          });
        });
        checklistSections.push({
          sectionTitle: cat.categoryName,
          items: sectionItems,
        });
      });

      const gridSelected = getOrderedDocPhotos(photos);
      const compressedGrid: Array<{ caption: string; dataUrl: string }> = [];
      for (const p of gridSelected) {
        try {
          const rawUrl = await resolveDocPhotoDataUrl(p, apiBase);
          if (rawUrl) {
            compressedGrid.push({
              caption: p.caption || '',
              dataUrl: await ImageCompressor.compress(rawUrl, 900, 0.78),
            });
          }
        } catch (photoErr: any) {
          console.warn('[IlReportWizard] Lewati 1 foto bermasalah:', photoErr?.message);
        }
      }

      const jointItem = getJointDocPhoto(photos);
      let jointPhotoDataUrl = '';
      if (jointItem) {
        try {
          const rawJoint = await resolveDocPhotoDataUrl(jointItem, apiBase);
          if (rawJoint) {
            jointPhotoDataUrl = await ImageCompressor.compress(rawJoint, 1200, 0.82);
          }
        } catch (jointErr: any) {
          console.warn('[IlReportWizard] Foto bersama gagal dimuat:', jointErr?.message);
        }
      }

      const cloudId =
        initialReportData?.cloudId ||
        `IL_${selectedInspection?.id || 'manual'}_${Date.now().toString(36)}`;
      const nowIso = new Date().toISOString();
      const allSafe =
        analysis.khaPass &&
        (analysis.kapasitasProteksiNum <= 0 || analysis.proteksiPass) &&
        analysis.unbalancePass &&
        analysis.groundingPass &&
        checklistFaults.length === 0;

      const reportPayload = {
        cloudId,
        inspectionId: selectedInspection?.id || '',
        reportNumber: reportNumber.trim(),
        inspectionTypeCode: 'IL',
        exportFormat: format,
        configVersion: '2.0.0',
        status: initialReportData?.status || 'draft',
        docxDriveFileId: initialReportData?.docxDriveFileId || '',
        pdfDriveFileId: initialReportData?.pdfDriveFileId || '',
        driveFileId: initialReportData?.driveFileId || '',
        createdAt: initialReportData?.createdAt || nowIso,
        generalData: {
          companyName: formData.companyName || '',
          companyAddress: formData.companyAddress || '',
          inspectionDate: formData.inspectionDate || '',
          reportDate: formData.reportDate || '',
          inspectorCompany: 'PT. AKSARA RIKSA PERDANA',
          inspectorName: selectedInspector?.name || '',
          inspectorField: selectedInspector?.field || 'Ahli Keselamatan dan Kesehatan Kerja Bidang Listrik',
          inspectorRegNumber: selectedInspector?.regNumber || '',
          inspectorCertNumber: selectedInspector?.regNumber || '',
          skpAhliImage: selectedInspector?.skpImageDataUrl || '',
          skpPerusahaanImage: companySkpImage || '',
        },
        technicalData: {
          ...formData,
          driveFolderId: selectedInspection?.driveFolderId || '',
          // Computed PUIL 2011 fields (100% synced with Template_IL-v1.docx)
          dayaAktifKw: analysis.dayaAktifKw,
          dayaAktifWatt: analysis.dayaAktifWatt,
          inDenominatorExpr: analysis.inDenominatorExpr,
          inDenominatorVal: analysis.inDenominatorVal,
          arusNominal: analysis.arusNominal,
          khaHitung: analysis.khaHitung,
          khaKabel: analysis.khaKabel,
          khaConclusion: analysis.khaConclusion,
          ratingCbHitung: analysis.ratingCbHitung,
          kapasitasProteksi: analysis.kapasitasProteksi,
          proteksiConclusion: analysis.proteksiConclusion,
          arusR: analysis.arusR,
          arusS: analysis.arusS,
          arusT: analysis.arusT,
          arusTotal: analysis.arusTotal,
          arusRataRata: analysis.arusRataRata,
          rasioA: analysis.rasioA,
          rasioB: analysis.rasioB,
          rasioC: analysis.rasioC,
          devA: analysis.devA,
          devB: analysis.devB,
          devC: analysis.devC,
          devTotal: analysis.devTotal,
          unbalancePercent: analysis.unbalancePercent,
          unbalanceConclusion: analysis.unbalanceConclusion,
        },
        checklistData: {
          configVersion: '2.0.0',
          checklistSections,
          components: componentsForDb,
          overallResult: allSafe ? 'LAIK' : 'PERLU_PERBAIKAN',
        },
        formulaResults: calcResult,
        aiNarrative: {
          sections: {
            visualSummary: visualSummary || '',
            testingSummary: testingSummary || '',
            conclusion: conclusion || '',
            recommendations: recommendations || '',
            closingNote: closingNote || '',
            executiveSummary: visualSummary || '',
            testResultsNarrative: testingSummary || '',
          },
        },
        photoDocumentation: {
          photos: compressedGrid,
          jointPhoto: jointPhotoDataUrl,
          ...buildPhotoSelectionMeta(photos),
        },
        bapAttachments: bapAttachments.map((att) => ({
          image: att.dataUrl,
          sourceFileName: att.sourceFileName,
          pageNumber: att.pageNumber,
        })),
        extraAttachments: extraAttachments.map((att) => ({
          image: att.dataUrl,
          sourceFileName: att.sourceFileName,
          pageNumber: att.pageNumber,
        })),
        updatedAt: nowIso,
      };

      let localId: number;
      if (reportId) {
        await db.reports.put({ ...reportPayload, id: reportId });
        localId = reportId;
      } else {
        localId = await db.reports.add(reportPayload);
      }

      const requestBody = { reportId: localId, reportData: reportPayload };
      const payloadBytes = estimateJsonPayloadBytes(requestBody);
      if (payloadBytes > 4.2 * 1024 * 1024) {
        const mb = (payloadBytes / (1024 * 1024)).toFixed(2);
        throw new Error(
          `Ukuran payload laporan (${mb} MB) mendekati batas 4.5 MB server. Kurangi beberapa foto atau halaman lampiran PDF lalu coba lagi.`
        );
      }

      const res = await fetch(`${apiBase}/api/report?action=generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await parseApiJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal membuat dokumen laporan.');
      }

      await db.reports.update(localId, {
        cloudId: data.cloudId || cloudId,
        status: 'completed',
        docxDriveFileId: data.outputDriveFileId || '',
        pdfDriveFileId: data.pdfDriveFileId || '',
        driveFileId: data.pdfDriveFileId || data.outputDriveFileId,
      });

      setExportResult({
        docxFileId: data.outputDriveFileId,
        pdfFileId: data.pdfDriveFileId,
        message: data.message,
      });
    } catch (err: any) {
      setExportError(err.message || 'Terjadi kesalahan saat mengekspor laporan.');
    } finally {
      setExportingFormat(null);
    }
  };

  const checklistBuilt = useMemo(() => {
    const checklistSections: any[] = [];
    const componentsForDb: any[] = [];

    config?.checklists.categories.forEach((cat) => {
      const sectionItems: any[] = [];
      let seqNo = 1;
      cat.components.forEach((comp) => {
        const compItems: any[] = [];
        comp.items.forEach((item) => {
          const hasil = checklistResults[item.itemId] ?? '-';
          const row = {
            itemId: item.itemId,
            no: seqNo++,
            obyek: item.description,
            hasil,
            nilaiRujukan: item.standard || '-',
            metode: item.method || 'Penilaian',
            description: item.description,
            result: hasil,
          };
          sectionItems.push(row);
          compItems.push(row);
        });
        componentsForDb.push({
          componentId: comp.componentId,
          componentName: comp.componentName,
          category: cat.categoryName,
          items: compItems,
        });
      });
      checklistSections.push({
        sectionTitle: cat.categoryName,
        items: sectionItems,
      });
    });

    return { checklistSections, componentsForDb };
  }, [config, checklistResults]);

  const previewData = useMemo<ReportPreviewData>(() => {
    const def = buildDefaultNarratives();
    const vText = visualSummary || def.visualText;
    const tText = testingSummary || def.testingText;
    const cText = conclusion || def.concText;
    const rText = recommendations || def.recText;
    const noteText = closingNote || def.noteText;
    const jointItem = photos.find((p) => p.isJointPhoto);

    return {
      inspectionTypeCode: 'IL',
      reportNumber: reportNumber.trim(),
      generalData: {
        companyName: formData.companyName || '',
        companyAddress: formData.companyAddress || '',
        inspectionDate: formData.inspectionDate || '',
        reportDate: formData.reportDate || '',
        inspectorCompany: 'PT. AKSARA RIKSA PERDANA',
        inspectorName: selectedInspector?.name || '',
        inspectorField:
          selectedInspector?.field || 'Ahli Keselamatan dan Kesehatan Kerja Bidang Listrik',
        inspectorCertNumber: selectedInspector?.regNumber || '',
        skpAhliImage: selectedInspector?.skpImageDataUrl || '',
        skpPerusahaanImage: companySkpImage || '',
      },
      technicalData: {
        ...formData,
        dayaAktifKw: analysis.dayaAktifKw,
        dayaAktifWatt: analysis.dayaAktifWatt,
        inDenominatorExpr: analysis.inDenominatorExpr,
        inDenominatorVal: analysis.inDenominatorVal,
        arusNominal: analysis.arusNominal,
        khaHitung: analysis.khaHitung,
        khaKabel: analysis.khaKabel,
        khaConclusion: analysis.khaConclusion,
        ratingCbHitung: analysis.ratingCbHitung,
        kapasitasProteksi: analysis.kapasitasProteksi,
        proteksiConclusion: analysis.proteksiConclusion,
        arusR: analysis.arusR,
        arusS: analysis.arusS,
        arusT: analysis.arusT,
        arusTotal: analysis.arusTotal,
        arusRataRata: analysis.arusRataRata,
        rasioA: analysis.rasioA,
        rasioB: analysis.rasioB,
        rasioC: analysis.rasioC,
        devA: analysis.devA,
        devB: analysis.devB,
        devC: analysis.devC,
        devTotal: analysis.devTotal,
        unbalancePercent: analysis.unbalancePercent,
        unbalanceConclusion: analysis.unbalanceConclusion,
      },
      checklistSections: checklistBuilt.checklistSections,
      narratives: {
        visualSummary: vText,
        testingSummary: tText,
        conclusion: cText,
        recommendations: rText,
        closingNote: noteText,
        executiveSummary: vText,
        testResultsNarrative: tText,
      },
      gridPhotos: getOrderedDocPhotos(photos).map((p) => ({
        id: p.id,
        caption: p.caption || '',
        dataUrl: p.dataUrl,
        driveFileId: p.driveFileId,
      })),
      jointPhoto: jointItem
        ? {
            id: jointItem.id,
            caption: jointItem.caption || '',
            dataUrl: jointItem.dataUrl,
            driveFileId: jointItem.driveFileId,
          }
        : null,
      bapAttachments: bapAttachments.map((att) => ({
        sourceFileName: att.sourceFileName,
        pageNumber: att.pageNumber,
        dataUrl: att.dataUrl,
      })),
      extraAttachments: extraAttachments.map((att) => ({
        sourceFileName: att.sourceFileName,
        pageNumber: att.pageNumber,
        dataUrl: att.dataUrl,
      })),
    };
  }, [
    formData,
    analysis,
    reportNumber,
    selectedInspector,
    companySkpImage,
    checklistBuilt,
    visualSummary,
    testingSummary,
    conclusion,
    recommendations,
    closingNote,
    photos,
    bapAttachments,
    extraAttachments,
  ]);

  const stickyHeaderNode = (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-extrabold">
              IL
            </span>
            <h2 className="text-sm font-extrabold text-gray-900 truncate">
              {formData.companyName || 'Laporan Instalasi Listrik'}
            </h2>
          </div>
          {onChangeSource && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Ganti sesi inspeksi? Isian yang belum diekspor pada form ini akan di-reset.')) {
                  onChangeSource();
                }
              }}
              className="text-[11px] font-semibold text-emerald-600 hover:underline"
            >
              ↻ Ganti Sesi Inspeksi
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('Tutup wizard laporan Instalasi Listrik? Perubahan yang belum disimpan akan hilang.')) {
              onClose();
            }
          }}
          className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200"
        >
          Tutup
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {[
          { id: 1, label: '1. Data Umum' },
          { id: 2, label: '2. Analisis & Cek' },
          { id: 3, label: '3. Narasi & Foto' },
          { id: 4, label: '4. Ekspor' },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id as 1 | 2 | 3 | 4)}
            className={`py-1.5 px-1 rounded-lg text-[11px] font-bold transition-all truncate ${
              step === s.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : step > s.id
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );

  const bottomNavNode = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        disabled={step === 1}
        onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
        className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold disabled:opacity-40"
      >
        ← Sebelumnya
      </button>
      <span className="text-[11px] font-bold text-gray-400">Langkah {step} / 4</span>
      {step < 4 ? (
        <button
          type="button"
          onClick={() => setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s))}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold hover:bg-emerald-700"
        >
          Lanjut →
        </button>
      ) : (
        <button
          type="button"
          onClick={() => handleExport('pdf')}
          disabled={exportingFormat !== null}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold hover:bg-emerald-700 disabled:opacity-50"
        >
          {exportingFormat ? 'Memproses...' : 'Ekspor PDF'}
        </button>
      )}
    </div>
  );

  return (
    <>
      <ReportWorkspaceLayout
        previewData={previewData}
        stickyHeader={stickyHeaderNode}
        bottomNav={bottomNavNode}
      >
        {/* ================= STEP 1: IDENTITAS & 12 DATA UMUM ================= */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                Identitas Laporan & Ahli K3 Bidang Listrik
              </h3>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Nomor Laporan Resmi *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reportNumber}
                    onChange={(e) => setReportNumber(e.target.value)}
                    placeholder="Contoh: 117 / ARP / IL / XI / 2026"
                    className="flex-1 px-3 py-2.5 text-xs font-mono bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAutoNumber}
                    disabled={autoNumberLoading}
                    className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 disabled:opacity-50 shrink-0"
                  >
                    {autoNumberLoading ? 'Mengambil...' : 'Auto Nomor'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Tanggal Periksa</label>
                  <input
                    type="date"
                    value={formData.inspectionDate}
                    onChange={(e) => handleFieldChange('inspectionDate', e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                  />
                  <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                    Di laporan: {formatTanggalHuruf(formData.inspectionDate)}
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Tanggal Terbit Laporan</label>
                  <input
                    type="date"
                    value={formData.reportDate}
                    onChange={(e) => handleFieldChange('reportDate', e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                  />
                  <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                    Di laporan: {formatTanggalHuruf(formData.reportDate)}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-600">Ahli K3 Pemeriksa (SKP)</label>
                  <button
                    type="button"
                    onClick={handleSyncInspectors}
                    disabled={syncingInspectors}
                    className="text-[11px] font-bold text-emerald-600 hover:underline"
                  >
                    {syncingInspectors ? 'Sinkron...' : '↻ Sync Ahli'}
                  </button>
                </div>
                <select
                  value={selectedInspectorId}
                  onChange={(e) => setSelectedInspectorId(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                >
                  {inspectors.length === 0 ? (
                    <option value="">-- Belum ada Master Ahli K3 (Isi di Panel Admin) --</option>
                  ) : (
                    inspectors.map((insp) => (
                      <option key={insp.id} value={insp.id}>
                        {insp.name} — {insp.regNumber}
                      </option>
                    ))
                  )}
                </select>
                {selectedInspector && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {selectedInspector.field} • {selectedInspector.skpImageDataUrl ? '✅ Scan SKP Ahli siap dilampirkan' : '⚠️ Scan SKP Ahli belum diunggah'}
                  </p>
                )}
                <p className="text-[11px] text-gray-500 mt-0.5">
                  SKP PJK3 Perusahaan: {companySkpImage ? '✅ Siap dilampirkan otomatis' : '⚠️ Belum diunggah di Panel Admin'}
                </p>
              </div>
            </div>

            {/* Accordion 1: Pemilik & Lokasi Panel (Data Umum 1, 2, 3, 12) */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion(openAccordion === 'umum_identitas' ? 'umum_daya' : 'umum_identitas')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 text-left"
              >
                <span className="text-xs font-extrabold text-gray-800">
                  1. Pemilik, Instalatir & Lokasi Panel (4 Item)
                </span>
                <span className="text-xs text-gray-500">{openAccordion === 'umum_identitas' ? '▲' : '▼'}</span>
              </button>
              {openAccordion === 'umum_identitas' && (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">1. Pemilik (Nama Perusahaan) *</label>
                      <input
                        type="text"
                        value={formData.companyName}
                        onChange={(e) => handleFieldChange('companyName', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">2. Alamat</label>
                      <input
                        type="text"
                        value={formData.companyAddress}
                        onChange={(e) => handleFieldChange('companyAddress', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">3. Instalatir Pemasang</label>
                      <input
                        type="text"
                        value={formData.instalatirPemasang}
                        onChange={(e) => handleFieldChange('instalatirPemasang', e.target.value)}
                        placeholder="- atau nama instalatir"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">12. Lokasi Panel (LVMDP / SDP) *</label>
                      <input
                        type="text"
                        value={formData.lokasiPanel}
                        onChange={(e) => handleFieldChange('lokasiPanel', e.target.value)}
                        placeholder="Ruang Panel LVMDP / Lantai 1"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 2: Sumber & Daya (Data Umum 4, 5, 6, 7) */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion(openAccordion === 'umum_daya' ? 'umum_listrik' : 'umum_daya')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 text-left"
              >
                <span className="text-xs font-extrabold text-gray-800">
                  2. Sumber Tegangan & Distribusi Daya (4 Item)
                </span>
                <span className="text-xs text-gray-500">{openAccordion === 'umum_daya' ? '▲' : '▼'}</span>
              </button>
              {openAccordion === 'umum_daya' && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">4. Sumber Tegangan</label>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {['PLN', 'Genset', 'PLTS', 'PLN & Genset'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleFieldChange('sumberTegangan', chip)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                            formData.sumberTegangan === chip
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={formData.sumberTegangan}
                      onChange={(e) => handleFieldChange('sumberTegangan', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">5. Sumber Daya Listrik</label>
                      <input
                        type="text"
                        value={formData.sumberDayaListrik}
                        onChange={(e) => handleFieldChange('sumberDayaListrik', e.target.value)}
                        placeholder="16.5 kVA"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">6. Daya Untuk Penerangan</label>
                      <input
                        type="text"
                        value={formData.dayaPenerangan}
                        onChange={(e) => handleFieldChange('dayaPenerangan', e.target.value)}
                        placeholder="9.9 kVA"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">7. Daya Untuk Tenaga</label>
                      <input
                        type="text"
                        value={formData.dayaTenaga}
                        onChange={(e) => handleFieldChange('dayaTenaga', e.target.value)}
                        placeholder="4.9 kVA"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 3: Spesifikasi Kelistrikan (Data Umum 8, 9, 10, 11) */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion(openAccordion === 'umum_listrik' ? 'umum_identitas' : 'umum_listrik')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 text-left"
              >
                <span className="text-xs font-extrabold text-gray-800">
                  3. Phasa, Frekuensi, Jenis Arus & Tegangan Kerja (4 Item)
                </span>
                <span className="text-xs text-gray-500">{openAccordion === 'umum_listrik' ? '▲' : '▼'}</span>
              </button>
              {openAccordion === 'umum_listrik' && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">8. Jumlah Phasa</label>
                    <div className="flex gap-2">
                      {['3 Phase', '1 Phase'].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleFieldChange('jumlahPhasa', opt)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                            formData.jumlahPhasa === opt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-700 border-gray-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">9. Frekuensi</label>
                      <div className="flex gap-1.5 mb-1.5">
                        {['50 Hz', '60 Hz'].map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleFieldChange('frekuensi', chip)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                              formData.frekuensi === chip
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={formData.frekuensi}
                        onChange={(e) => handleFieldChange('frekuensi', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">10. Jenis Arus</label>
                      <div className="flex gap-1.5 mb-1.5">
                        {['AC (Alternating Current)', 'DC (Direct Current)'].map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleFieldChange('jenisArus', chip)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                              formData.jenisArus === chip
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            {chip.startsWith('AC') ? 'AC' : 'DC'}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={formData.jenisArus}
                        onChange={(e) => handleFieldChange('jenisArus', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">11. Tegangan Kerja</label>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {['220 / 380 Volt', '220 Volt', '380 Volt', '20 kV'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleFieldChange('teganganKerja', chip)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                            formData.teganganKerja === chip
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={formData.teganganKerja}
                      onChange={(e) => handleFieldChange('teganganKerja', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= STEP 2: ANALISIS PUIL 2011, PENGUKURAN & CHECKLIST ================= */}
        {step === 2 && (
          <div className="space-y-4">
            {/* A. Kalkulator Arus Nominal & KHA Kabel Utama */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                    Analisis PUIL 2011 (Otomatis Real-Time)
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Menghitung Arus Nominal (In), KHA Penghantar (125%), Rating CB (115%), & Unbalance RST.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPuilTableModal(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"
                >
                  📖 Tabel 2.5 PUIL
                </button>
              </div>

              {/* 1. Arus Nominal (In) */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-gray-700">1. Arus Nominal (In) — {formData.jumlahPhasa}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-extrabold">
                    In = {analysis.arusNominal} A
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Daya (kVA)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.dayaTerpasangKva}
                      onChange={(e) => handleFieldChange('dayaTerpasangKva', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Tegangan (V)</label>
                    <input
                      type="number"
                      value={formData.teganganVolt}
                      onChange={(e) => handleFieldChange('teganganVolt', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Cos φ</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.cosPhi}
                      onChange={(e) => handleFieldChange('cosPhi', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-gray-200 rounded-lg"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 font-mono">
                  P = {analysis.dayaAktifKw} kW ({analysis.dayaAktifWatt} W) • In = {analysis.dayaAktifWatt} / ({analysis.inDenominatorExpr}) = {analysis.arusNominal} A
                </p>
              </div>

              {/* 2. KHA Penghantar Utama (Tabel 2.5 PUIL 2011) */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-gray-700">
                    2. KHA Penghantar Utama (1,25 × In = {analysis.khaHitung} A)
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                      analysis.khaKabelNum <= 0
                        ? 'bg-gray-200 text-gray-600'
                        : analysis.khaPass
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {analysis.khaKabelNum <= 0 ? 'BELUM DIISI' : analysis.khaPass ? 'ACC' : 'TIDAK ACC'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Jenis Kabel</label>
                    <select
                      value={formData.jenisKabel}
                      onChange={(e) => handleFieldChange('jenisKabel', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg font-semibold"
                    >
                      {[
                        'NYY', 'NYBY', 'NYFGbY', 'NYRGbY', 'NYC', 'NYCWY', 'NYSY',
                        'NYCEY', 'NYSEY', 'NYHSY', 'NYKY', 'NYKBY', 'NYKFGbY', 'NYKRGbY',
                      ].map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Ukuran Kabel (Teks Laporan)</label>
                    <input
                      type="text"
                      value={formData.ukuranKabel}
                      onChange={(e) => handleFieldChange('ukuranKabel', e.target.value)}
                      placeholder="4 x (1 x 10) mm2"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Penampang (mm²)</label>
                    <select
                      value={formData.luasPenampangMm2}
                      onChange={(e) => handleFieldChange('luasPenampangMm2', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg font-semibold"
                    >
                      {PUIL_CROSS_SECTIONS.map((s) => (
                        <option key={s} value={s}>{s} mm²</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Jumlah Inti</label>
                    <select
                      value={formData.jumlahIntiKabel}
                      onChange={(e) => handleFieldChange('jumlahIntiKabel', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg font-semibold"
                    >
                      <option value="1">Inti Tunggal (1)</option>
                      <option value="2">2-Inti</option>
                      <option value="3-4">3 dan 4 Inti</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Instalasi</label>
                    <select
                      value={formData.instalasiKabel}
                      onChange={(e) => handleFieldChange('instalasiKabel', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg font-semibold"
                    >
                      <option value="Di Udara">Di Udara</option>
                      <option value="Di Tanah">Di Tanah</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-700 mb-1">KHA Kabel (A)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={formData.khaKabel}
                      onChange={(e) => handleFieldChange('khaKabel', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-extrabold bg-white border border-emerald-300 rounded-lg"
                    />
                  </div>
                </div>
                <p className={`text-[10px] font-semibold ${analysis.khaPass ? 'text-emerald-700' : 'text-red-600'}`}>
                  {analysis.khaConclusion}
                </p>
              </div>

              {/* 3. Rating Proteksi Utama (CB) */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-gray-700">
                    3. Rating Proteksi Utama (1,15 × In = {analysis.ratingCbHitung} A)
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                      analysis.kapasitasProteksiNum <= 0
                        ? 'bg-gray-200 text-gray-600'
                        : analysis.proteksiPass
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {analysis.kapasitasProteksiNum <= 0 ? 'BELUM DIISI' : analysis.proteksiPass ? 'ACC' : 'TIDAK ACC'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Jenis Proteksi</label>
                    <div className="grid grid-cols-4 gap-1">
                      {['MCCB', 'MCB', 'ACB', 'Fuse'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleFieldChange('jenisProteksi', p)}
                          className={`py-2 rounded-lg text-[10px] font-bold border ${
                            formData.jenisProteksi === p
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-700 border-gray-200'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Kapasitas Terpasang (A)</label>
                    <input
                      type="number"
                      value={formData.kapasitasProteksi}
                      onChange={(e) => handleFieldChange('kapasitasProteksi', e.target.value)}
                      placeholder="Contoh: 200"
                      className="w-full px-2.5 py-2 text-xs font-bold bg-white border border-gray-200 rounded-lg"
                    />
                  </div>
                </div>
                <p className={`text-[10px] font-semibold ${analysis.proteksiPass ? 'text-emerald-700' : 'text-red-600'}`}>
                  {analysis.proteksiConclusion}
                </p>
              </div>
            </div>

            {/* B. Pengukuran Beban RST, Suhu & Pentanahan */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                    Pengukuran Beban RST, Suhu & Pentanahan
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Hasil otomatis masuk ke tabel Analisis Unbalance & Checklist Pengujian (No. 5).
                  </p>
                </div>
                {photos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOcrModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold hover:bg-indigo-100"
                  >
                    📷 OCR Clamp / Thermograf
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { key: 'arusR', label: 'IR (A)' },
                  { key: 'arusS', label: 'IS (A)' },
                  { key: 'arusT', label: 'IT (A)' },
                  { key: 'arusNetral', label: 'IN (A)' },
                  { key: 'arusPE', label: 'IPE (A)' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">{f.label}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData[f.key]}
                      onChange={(e) => handleFieldChange(f.key, e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg"
                    />
                  </div>
                ))}
              </div>

              <div
                className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                  analysis.unbalancePass
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center justify-between font-extrabold">
                  <span>I Rata-rata = {analysis.arusRataRata} A • I Unbalance = {analysis.unbalancePercent}%</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${analysis.unbalancePass ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {analysis.unbalancePass ? 'ACC (< 20%)' : 'TIDAK ACC (>= 20%)'}
                  </span>
                </div>
                <p className="text-[10px]">{analysis.unbalanceConclusion}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'suhuR', label: 'Suhu R (°C)', placeholder: '32.5' },
                  { key: 'suhuS', label: 'Suhu S (°C)', placeholder: '32.1' },
                  { key: 'suhuT', label: 'Suhu T (°C)', placeholder: '33.0' },
                  { key: 'tahananPentanahan', label: 'Pentanahan (Ω)', placeholder: '1.25' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">{f.label}</label>
                    <input
                      type={f.key === 'tahananPentanahan' ? 'text' : 'number'}
                      step="0.01"
                      value={formData[f.key]}
                      onChange={(e) => handleFieldChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1">Daya Penerangan (A)</label>
                  <input
                    type="text"
                    value={formData.dayaPeneranganAmp}
                    onChange={(e) => handleFieldChange('dayaPeneranganAmp', e.target.value)}
                    placeholder="Contoh: 12 A"
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1">Daya AC (A)</label>
                  <input
                    type="text"
                    value={formData.dayaAcAmp}
                    onChange={(e) => handleFieldChange('dayaAcAmp', e.target.value)}
                    placeholder="Contoh: 15 A"
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1">Daya Mesin (A)</label>
                  <input
                    type="text"
                    value={formData.dayaMesinAmp}
                    onChange={(e) => handleFieldChange('dayaMesinAmp', e.target.value)}
                    placeholder="Contoh: 25 A"
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* C. Checklist 5 Kategori Resmi Disnaker */}
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-extrabold text-gray-700 uppercase">Checklist Pemeriksaan & Pengujian (5 Bagian)</p>
              <button
                type="button"
                onClick={() => setEditedTestingRows({})}
                className="text-[11px] font-bold text-emerald-600 hover:underline"
              >
                ↻ Sinkron Ulang Pengujian
              </button>
            </div>

            {config?.checklists.categories.map((cat) => {
              const isTestingCat = cat.categoryId === 'pengujian';
              return (
                <div key={cat.categoryId} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-gray-800">{cat.categoryName}</span>
                    {!isTestingCat && (
                      <button
                        type="button"
                        onClick={() => handleSetCategoryAllGood(cat.categoryId)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-extrabold hover:bg-emerald-200 shrink-0"
                      >
                        ✓ Set Semua Baik/Sesuai
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {cat.components.flatMap((comp) =>
                      comp.items.map((item) => {
                        const val = checklistResults[item.itemId] ?? '-';
                        return (
                          <div key={item.itemId} className="p-3 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-800">
                                  <span className="text-gray-400 font-mono mr-1.5">{item.itemId}</span>
                                  {item.description}
                                </p>
                                <p className="text-[10px] text-gray-400">
                                  Rujukan: {item.standard || '-'} • Metode: {item.method || 'Penilaian'}
                                </p>
                              </div>
                            </div>

                            {!isTestingCat && (
                              <div className="flex flex-wrap gap-1">
                                {CHECKLIST_QUICK_RESULTS.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() =>
                                      setChecklistResults((prev) => ({ ...prev, [item.itemId]: opt }))
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                                      val === opt
                                        ? isChecklistItemFaulty(item.itemId, opt)
                                          ? 'bg-red-600 text-white border-transparent'
                                          : 'bg-emerald-600 text-white border-transparent'
                                        : 'bg-white text-gray-600 border-gray-200'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}

                            <input
                              type="text"
                              value={val}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (isTestingCat) {
                                  setEditedTestingRows((prev) => ({ ...prev, [item.itemId]: true }));
                                }
                                setChecklistResults((prev) => ({ ...prev, [item.itemId]: v }));
                              }}
                              placeholder="Hasil pemeriksaan/pengukuran..."
                              className="w-full px-2.5 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded-lg font-medium"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ================= STEP 3: NARASI, FOTO & LAMPIRAN ================= */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                  Narasi Pemeriksaan, Kesimpulan & Syarat-Syarat
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const def = buildDefaultNarratives();
                      setVisualSummary(def.visualText);
                      setTestingSummary(def.testingText);
                      setConclusion(def.concText);
                      setRecommendations(def.recText);
                      setClosingNote(def.noteText);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold"
                  >
                    ↻ Reset Baku
                  </button>
                  <button
                    type="button"
                    onClick={handlePolishNarrativeWithAI}
                    disabled={aiNarrativeLoading}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {aiNarrativeLoading ? 'Memoles...' : '✨ Poles Narasi AI'}
                  </button>
                </div>
              </div>

              {[
                { label: 'PEMERIKSAAN (Visual PHB & Data Teknis)', val: visualSummary, set: setVisualSummary, rows: 3 },
                { label: 'PENGUJIAN (Arus RST, KHA, Proteksi & Grounding)', val: testingSummary, set: setTestingSummary, rows: 4 },
                { label: 'KESIMPULAN', val: conclusion, set: setConclusion, rows: 3 },
                { label: 'SYARAT - SYARAT (Rekomendasi K3)', val: recommendations, set: setRecommendations, rows: 4 },
                { label: 'Catatan Penutup (closingNote)', val: closingNote, set: setClosingNote, rows: 2 },
              ].map((sec) => (
                <div key={sec.label}>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">{sec.label}</label>
                  <textarea
                    rows={sec.rows}
                    value={sec.val}
                    onChange={(e) => sec.set(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl leading-relaxed"
                  />
                </div>
              ))}
            </div>

            {/* Pemilih Foto Dokumentasi (Gaya TikTok / Instagram + Foto Bersama) */}
            <DocumentationPhotoPicker
              photos={photos}
              onChange={setPhotos}
              apiBase={apiBase}
              onAutoCategorize={handleAutoCategorizePhotos}
              aiLoading={aiPhotoLoading}
            />

            {/* Lampiran BAP (Sebelum Halaman SKP) */}
            <AttachmentSectionCard
              title="Lampiran BAP (Berita Acara Pemeriksaan)"
              badgeText="Sebelum Halaman SKP"
              subtitle="Unggah scan/foto/PDF Berita Acara Pemeriksaan setelah pemeriksaan selesai. Disisipkan sebelum halaman SKP PJK3 & SKP Ahli."
              emptyText="Belum ada lampiran BAP (Berita Acara Pemeriksaan)."
              buttonLabel="+ Unggah BAP (PDF / Foto)"
              accent="indigo"
              items={bapAttachments}
              onChange={setBapAttachments}
            />

            <div className="px-3 py-2 rounded-xl bg-gray-50 border border-dashed border-gray-300 text-[11px] font-semibold text-gray-600 text-center">
              📄 Halaman SKP PJK3 Perusahaan &amp; SKP Ahli K3 disisipkan otomatis di sini ({companySkpImage ? 'SKP Perusahaan ✓' : 'SKP Perusahaan kosong'} • {selectedInspector?.skpImageDataUrl ? 'SKP Ahli ✓' : 'SKP Ahli kosong'})
            </div>

            {/* Lampiran Tambahan Akhir (Setelah Halaman SKP) */}
            <AttachmentSectionCard
              title="Lampiran Tambahan Akhir (PDF / Gambar)"
              badgeText="Setelah Halaman SKP"
              subtitle="Surat Permohonan Evaluasi, Single Line Diagram, sertifikat alat ukur, atau dokumen pendukung di halaman akhir."
              emptyText="Belum ada lampiran tambahan akhir (SLD, sertifikat alat, dll.)."
              buttonLabel="+ Tambah Lampiran (PDF / Foto)"
              accent="emerald"
              items={extraAttachments}
              onChange={setExtraAttachments}
            />
          </div>
        )}

        {/* ================= STEP 4: PREVIEW, QC AI & EXPORT ================= */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                  Ringkasan & Kelengkapan Laporan IL
                </h3>
                <button
                  type="button"
                  onClick={handleRunPreFlightQc}
                  disabled={qcLoading}
                  className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold"
                >
                  {qcLoading ? 'Memeriksa...' : '🔍 Pre-Flight QC (AI)'}
                </button>
              </div>

              {(missingFields.length > 0 ||
                (photos.length > 0 && (getOrderedDocPhotos(photos).length === 0 || !getJointDocPhoto(photos))) ||
                bapAttachments.length === 0) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                  {missingFields.length > 0 && (
                    <>
                      <p className="font-bold">⚠️ Beberapa kolom penting masih kosong:</p>
                      <p className="text-[11px]">{missingFields.map((m) => m.label).join(', ')}</p>
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="text-[11px] font-bold underline block"
                      >
                        Lengkapi Data →
                      </button>
                    </>
                  )}
                  {photos.length > 0 && getOrderedDocPhotos(photos).length === 0 && (
                    <div className="pt-1">
                      <p className="font-bold">⚠️ Belum ada Foto Dokumentasi yang dipilih.</p>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="text-[11px] font-bold underline"
                      >
                        Ketuk foto secara berurutan di Langkah 3 →
                      </button>
                    </div>
                  )}
                  {photos.length > 0 && !getJointDocPhoto(photos) && (
                    <div className="pt-1">
                      <p className="font-bold">⚠️ Foto Bersama Pihak Perusahaan belum dipilih.</p>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="text-[11px] font-bold underline"
                      >
                        Pilih 1 Foto Bersama di Langkah 3 →
                      </button>
                    </div>
                  )}
                  {bapAttachments.length === 0 && (
                    <div className="pt-1">
                      <p className="font-bold">⚠️ Lampiran BAP (Berita Acara Pemeriksaan) sebelum halaman SKP belum diunggah.</p>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="text-[11px] font-bold underline"
                      >
                        Unggah BAP di Langkah 3 →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {qcNotes && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 whitespace-pre-line">
                  <p className="font-bold mb-1">Hasil Pre-Flight QC:</p>
                  {qcNotes}
                </div>
              )}

              {/* Ringkasan Analisis ACC/TIDAK ACC */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[10px] text-gray-500">Nomor Laporan & Tanggal</p>
                  <p className="font-bold text-gray-900">{reportNumber || '-'}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Periksa: {formatTanggalHuruf(formData.inspectionDate)} • Terbit: {formatTanggalHuruf(formData.reportDate)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[10px] text-gray-500">Ahli K3 & Lokasi Panel</p>
                  <p className="font-bold text-gray-900">{selectedInspector?.name || '-'}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{formData.lokasiPanel || '-'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                  <p className="text-[10px] text-gray-500">Status Analisis PUIL 2011</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold">
                      In: {analysis.arusNominal} A
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        analysis.khaPass ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      KHA: {analysis.khaPass ? 'ACC' : 'TIDAK ACC'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        analysis.proteksiPass ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      CB: {analysis.proteksiPass ? 'ACC' : 'TIDAK ACC'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        analysis.unbalancePass ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      Unbal {analysis.unbalancePercent}%: {analysis.unbalancePass ? 'ACC' : 'TIDAK ACC'}
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[10px] text-gray-500">Dokumentasi & Lampiran</p>
                  <p className="font-bold text-gray-900">
                    {getOrderedDocPhotos(photos).length} Foto,{' '}
                    {getJointDocPhoto(photos) ? '1' : '0'} Bersama,{' '}
                    {bapAttachments.length} BAP,{' '}
                    {extraAttachments.length} Akhir
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    SKP Perusahaan: {companySkpImage ? '✅ Ada' : '⚠️ Kosong'} • SKP Ahli:{' '}
                    {selectedInspector?.skpImageDataUrl ? '✅ Ada' : '⚠️ Kosong'}
                  </p>
                </div>
              </div>

              {exportError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
                  ❌ {exportError}
                </div>
              )}

              {exportResult && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <p className="text-xs font-extrabold text-emerald-800">
                    ✅ Laporan Instalasi Listrik berhasil dibuat & disimpan di Google Drive!
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {exportResult.docxFileId && (
                      <a
                        href={`https://drive.google.com/file/d/${exportResult.docxFileId}/view`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-700 text-xs font-bold"
                      >
                        📝 Buka Word (.docx) di Drive
                      </a>
                    )}
                    {exportResult.pdfFileId && (
                      <a
                        href={`https://drive.google.com/file/d/${exportResult.pdfFileId}/view`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                      >
                        📄 Buka PDF Identik di Drive
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('docx')}
                  className="py-3.5 px-4 rounded-2xl bg-blue-600 text-white text-xs font-extrabold hover:bg-blue-700 disabled:opacity-50"
                >
                  {exportingFormat === 'docx' ? 'Membuat Word...' : '📝 Export Word (.docx)'}
                </button>
                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('pdf')}
                  className="py-3.5 px-4 rounded-2xl bg-emerald-600 text-white text-xs font-extrabold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {exportingFormat === 'pdf' ? 'Membuat PDF Identik...' : '📄 Export PDF (Identik Word)'}
                </button>
              </div>
            </div>
          </div>
        )}
      </ReportWorkspaceLayout>

      {/* Modal Pilih Foto untuk AI Vision OCR */}
      {showOcrModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowOcrModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-4 space-y-3 max-h-[80vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold text-gray-800">
                Pilih Foto Layar Clamp Meter / Thermograf / Earth Tester
              </h4>
              <button
                type="button"
                onClick={() => setShowOcrModal(false)}
                className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600"
              >
                ✕
              </button>
            </div>
            {ocrLoading ? (
              <p className="text-xs text-center py-8 font-bold text-indigo-600">
                ⏳ Membaca layar alat ukur dengan Gemini Vision...
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleRunOcrOnPhoto(p)}
                    className="border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-500 text-left"
                  >
                    <img
                      src={p.dataUrl || (p.driveFileId ? `${apiBase}/api/photo-proxy?fileId=${p.driveFileId}` : '')}
                      alt={p.caption}
                      onError={(e) => {
                        e.currentTarget.style.opacity = '0.25';
                      }}
                      className="w-full h-28 object-cover bg-gray-100"
                    />
                    <p className="p-1.5 text-[10px] font-semibold text-gray-600 truncate">{p.caption}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Referensi Tabel 2.5 PUIL 2011 */}
      {showPuilTableModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowPuilTableModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-xl w-full p-4 space-y-3 max-h-[85vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold text-gray-800">
                Tabel 2.5 Daftar KHA Kabel PUIL 2011 Hal. 524
              </h4>
              <button
                type="button"
                onClick={() => setShowPuilTableModal(false)}
                className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-100 text-gray-700">
                    <th rowSpan={2} className="border border-gray-200 p-1.5">mm²</th>
                    <th colSpan={2} className="border border-gray-200 p-1">Inti Tunggal</th>
                    <th colSpan={2} className="border border-gray-200 p-1">2-Inti</th>
                    <th colSpan={2} className="border border-gray-200 p-1">3 &amp; 4 Inti</th>
                  </tr>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="border border-gray-200 p-1">Tanah</th>
                    <th className="border border-gray-200 p-1">Udara</th>
                    <th className="border border-gray-200 p-1">Tanah</th>
                    <th className="border border-gray-200 p-1">Udara</th>
                    <th className="border border-gray-200 p-1">Tanah</th>
                    <th className="border border-gray-200 p-1">Udara</th>
                  </tr>
                </thead>
                <tbody>
                  {PUIL_2011_KHA_TABLE.map((row) => (
                    <tr
                      key={row.mm2}
                      className={row.mm2 === String(formData.luasPenampangMm2) ? 'bg-emerald-50 font-bold' : ''}
                    >
                      <td className="border border-gray-200 p-1 text-center">{row.mm2}</td>
                      <td className="border border-gray-200 p-1 text-center">{row.intiTunggal.diTanah}</td>
                      <td className="border border-gray-200 p-1 text-center">{row.intiTunggal.diUdara}</td>
                      <td className="border border-gray-200 p-1 text-center">{row.duaInti.diTanah ?? '-'}</td>
                      <td className="border border-gray-200 p-1 text-center">{row.duaInti.diUdara ?? '-'}</td>
                      <td className="border border-gray-200 p-1 text-center">{row.tigaEmpatInti.diTanah ?? '-'}</td>
                      <td className="border border-gray-200 p-1 text-center">{row.tigaEmpatInti.diUdara ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
