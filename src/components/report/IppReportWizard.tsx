// src/components/report/IppReportWizard.tsx
import { useState, useEffect, useMemo } from 'react';
import {
  db,
  InspectorRepository,
  CompanySkpRepository,
  type InspectorProfile,
} from '../../db/db';
import { getConfigByCode } from '../../report-configs/registry';
import { calculateCrossSectionFromSigmat } from '../../report-configs/penyalur-petir/formulas';
import { FormulaEngine } from '../../engines/FormulaEngine';
import { ImageCompressor } from '../../engines/ImageCompressor';
import { getApiBaseUrl } from '../../config';
import { registerBackInterceptor } from '../../utils/navigationGuard';
import { processPdfOrImagePages } from '../../utils/skpImageHelper';

interface IppReportWizardProps {
  selectedInspection: any;
  reportId: number | null;
  initialReportData?: any;
  onChangeSource?: () => void;
  onClose: () => void;
}

interface GroundingPointInput {
  pointName: string;
  resistanceValue: string;
  pointRemarks: string;
}

interface PhotoItemState {
  id: string;
  dataUrl: string;
  driveFileId?: string;
  fileName?: string;
  caption: string;
  selectedForGrid: boolean;
  isJointPhoto: boolean;
}

interface ExtraAttachmentState {
  id: string;
  sourceFileName: string;
  pageNumber: number;
  dataUrl: string;
}

function parseGroundingPointsFromStr(str: string): GroundingPointInput[] {
  const raw = String(str || '').trim();
  if (!raw) {
    return [{ pointName: 'Titik 1 (Bak Kontrol 1)', resistanceValue: '', pointRemarks: 'Memenuhi (<= 5 Ohm)' }];
  }
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return [{ pointName: 'Titik 1 (Bak Kontrol 1)', resistanceValue: '', pointRemarks: 'Memenuhi (<= 5 Ohm)' }];
  }
  return parts.map((val, idx) => {
    const num = Number(val.replace(',', '.'));
    const pass = !isNaN(num) && num <= 5.0;
    return {
      pointName: `Titik ${idx + 1}`,
      resistanceValue: val,
      pointRemarks: !isNaN(num) ? (pass ? 'Memenuhi (<= 5 Ω)' : 'Tidak Memenuhi (> 5 Ω)') : '',
    };
  });
}

export function IppReportWizard({
  selectedInspection,
  reportId,
  initialReportData,
  onChangeSource,
  onClose,
}: IppReportWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const config = getConfigByCode('IPP');
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    const unregister = registerBackInterceptor(() => {
      if (step > 1) {
        setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev));
        return true;
      }
      if (confirm('Tutup wizard laporan IPP? Perubahan yang belum disimpan akan hilang.')) {
        onClose();
      }
      return true;
    });
    return unregister;
  }, [step, onClose]);

  // --- INSPECTORS & COMPANY SKP ---
  const [inspectors, setInspectors] = useState<InspectorProfile[]>([]);
  const [selectedInspectorId, setSelectedInspectorId] = useState<string>('');
  const [syncingInspectors, setSyncingInspectors] = useState(false);
  const [companySkpImage, setCompanySkpImage] = useState<string>(
    initialReportData?.generalData?.skpPerusahaanImage || ''
  );

  // --- STEP 1: DATA UMUM & ACCORDION ---
  const [openAccordion, setOpenAccordion] = useState<'identitas' | 'dimensi' | 'konstruksi'>('identitas');
  const [reportNumber, setReportNumber] = useState<string>(
    initialReportData?.reportNumber || ''
  );
  const [autoNumberLoading, setAutoNumberLoading] = useState(false);

  const unitData = selectedInspection?.unitData || {};
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const base: Record<string, any> = {
      companyName: selectedInspection?.clientName || '',
      companyAddress: unitData.lokasiUnit || unitData.alamatPerusahaan || '',
      inspectionDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
      reportDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
      jenisAlat: 'Instalasi Penyalur Petir',
      jenisPenyalurPetir: unitData.jenisPenyalurPetir || 'Elektrostatis',
      bentukPenerima: unitData.bentukPenerima || 'Bulat Runcing',
      merkType: unitData.merkType || '-',
      tahunPemasangan: unitData.tahunPemasangan || '-',
      tinggiTiangPenerima: unitData.tinggiTiangPenerima || unitData.tinggiTiangPenangkal || '',
      tinggiBangunan: unitData.tinggiBangunan || '',
      jumlahAirTerminal: unitData.jumlahAirTerminal || '1 unit',
      jumlahBoxKontrol: unitData.jumlahBoxKontrol || '1 unit',
      jumlahElektrodaPembumian: unitData.jumlahElektrodaPembumian || unitData.jumlahTitikGrounding || '1 buah',
      radiusPerlindungan: unitData.radiusPerlindungan || '',
      jumlahDownConductor: unitData.jumlahDownConductor || '1 buah',
      jenisDownConductor: unitData.jenisDownConductor || 'BC 50 mm2',
      diameterTiangPenerima: unitData.diameterTiangPenerima || '2 Inch',
      luasBangunan: unitData.luasBangunan || '-',
      jenisKonstruksi: unitData.jenisKonstruksi || 'Coran',
      atapBangunan: unitData.atapBangunan || 'Coran',
      dindingBangunan: unitData.dindingBangunan || 'Tembokan',
      lantaiBangunan: unitData.lantaiBangunan || 'Coran',
      lokasiPemasangan: unitData.lokasiPemasangan || unitData.lokasiUnit || '',
      hasilUkurSigmat: unitData.hasilUkurSigmat || '',
      luasPenampangHitung: unitData.luasPenampangHitung || (unitData.hasilUkurSigmat ? calculateCrossSectionFromSigmat(Number(unitData.hasilUkurSigmat)) : 50),
      tahananPembumian: unitData.tahananPembumian || '',
      measuringTool: unitData.measuringTool || 'Earth Tester Merk Kyoritsu',
    };
    if (initialReportData) {
      return {
        ...base,
        ...(initialReportData.generalData || {}),
        ...(initialReportData.technicalData || {}),
      };
    }
    return base;
  });

  // --- STEP 2: GROUNDING POINTS & CHECKLIST ---
  const [groundingPoints, setGroundingPoints] = useState<GroundingPointInput[]>(() =>
    initialReportData?.technicalData?.groundingPoints?.length
      ? initialReportData.technicalData.groundingPoints
      : parseGroundingPointsFromStr(formData.tahananPembumian)
  );

  const [checklistResults, setChecklistResults] = useState<Record<string, 'BAIK' | 'TIDAK_BAIK' | 'NA'>>(() => {
    const map: Record<string, 'BAIK' | 'TIDAK_BAIK' | 'NA'> = {};
    if (config) {
      config.checklists.categories.forEach((cat) =>
        cat.components.forEach((comp) =>
          comp.items.forEach((item) => {
            map[item.itemId] = 'BAIK';
          })
        )
      );
    }
    if (initialReportData?.checklistData) {
      initialReportData.checklistData.components?.forEach((c: any) =>
        c.items?.forEach((it: any) => {
          map[it.itemId] = it.result === 'KURANG' || it.result === 'TIDAK_ADA' || it.result === 'TIDAK_BAIK' ? 'TIDAK_BAIK' : it.result === 'NA' ? 'NA' : 'BAIK';
        })
      );
      initialReportData.checklistData.continuity?.forEach((it: any) => {
        map[it.itemId] = it.result === 'KURANG' || it.result === 'TIDAK_ADA' || it.result === 'TIDAK_BAIK' ? 'TIDAK_BAIK' : it.result === 'NA' ? 'NA' : 'BAIK';
      });
    }
    return map;
  });

  const [checklistRemarks, setChecklistRemarks] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialReportData?.checklistData) {
      initialReportData.checklistData.components?.forEach((c: any) =>
        c.items?.forEach((it: any) => {
          if (it.remarks) map[it.itemId] = it.remarks;
        })
      );
      initialReportData.checklistData.continuity?.forEach((it: any) => {
        if (it.remarks) map[it.itemId] = it.remarks;
      });
    }
    return map;
  });
  const [editedRemarks, setEditedRemarks] = useState<Record<string, boolean>>({});

  // --- STEP 3: NARASI & FOTO ---
  const [visualSummary, setVisualSummary] = useState<string>(initialReportData?.aiNarrative?.sections?.visualSummary || '');
  const [measurementSummary, setMeasurementSummary] = useState<string>(initialReportData?.aiNarrative?.sections?.measurementSummary || '');
  const [conclusion, setConclusion] = useState<string>(initialReportData?.aiNarrative?.sections?.conclusion || '');
  const [recommendations, setRecommendations] = useState<string>(initialReportData?.aiNarrative?.sections?.recommendations || '');

  const [photos, setPhotos] = useState<PhotoItemState[]>(() => {
    const sourcePhotos = selectedInspection?.photos || [];
    return sourcePhotos.map((p: any, idx: number) => ({
      id: p.id || String(idx),
      dataUrl: p.dataUrl || '',
      driveFileId: p.driveFileId,
      fileName: p.fileName,
      caption: p.caption || `Dokumentasi Pemeriksaan ${idx + 1}`,
      selectedForGrid: idx < 6,
      isJointPhoto: false,
    }));
  });

  // --- LAMPIRAN TAMBAHAN (PDF / FOTO MULTI-HALAMAN) ---
  const [extraAttachments, setExtraAttachments] = useState<ExtraAttachmentState[]>(() => {
    if (Array.isArray(initialReportData?.extraAttachments)) {
      return initialReportData.extraAttachments.map((att: any, idx: number) => ({
        id: `init-${idx}-${Date.now()}`,
        sourceFileName: att.sourceFileName || `Lampiran ${idx + 1}`,
        pageNumber: att.pageNumber || idx + 1,
        dataUrl: att.image || att.dataUrl || '',
      }));
    }
    return [];
  });
  const [attachmentProcessing, setAttachmentProcessing] = useState(false);

  // --- AI & EXPORT STATES ---
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [aiNarrativeLoading, setAiNarrativeLoading] = useState(false);
  const [aiPhotoLoading, setAiPhotoLoading] = useState(false);
  const [qcLoading, setQcLoading] = useState(false);
  const [qcNotes, setQcNotes] = useState<string | null>(null);

  const [exportingFormat, setExportingFormat] = useState<'docx' | 'pdf' | null>(null);
  const [exportResult, setExportResult] = useState<{ docxFileId?: string; pdfFileId?: string; message?: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // --- LOAD INSPECTORS & COMPANY SKP ---
  useEffect(() => {
    const initInspectors = async () => {
      let [list, localSkp] = await Promise.all([
        InspectorRepository.getAll(),
        CompanySkpRepository.getSkpImage(),
      ]);
      if (list.length === 0 || !localSkp) {
        try {
          const res = await fetch(`${apiBase}/api/report?action=inspectors`);
          const data = await res.json();
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
      if (localSkp && !companySkpImage) {
        setCompanySkpImage(localSkp);
      }
      setInspectors(list);
      if (list.length > 0 && !selectedInspectorId) {
        const matched = initialReportData?.generalData?.inspectorName
          ? list.find((i) => i.name === initialReportData.generalData.inspectorName)
          : list[0];
        if (matched) setSelectedInspectorId(matched.id);
      }
    };
    initInspectors();
  }, [apiBase, initialReportData, selectedInspectorId, companySkpImage]);

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
        body: JSON.stringify({ inspectionTypeCode: 'IPP', year, month }),
      });
      const data = await res.json();
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

  const handleAddExtraAttachments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setAttachmentProcessing(true);
    try {
      const added: ExtraAttachmentState[] = [];
      for (const file of files) {
        const pages = await processPdfOrImagePages(file);
        pages.forEach((pg) => {
          added.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sourceFileName: file.name,
            pageNumber: pg.pageNumber,
            dataUrl: pg.dataUrl,
          });
        });
      }
      setExtraAttachments((prev) => [...prev, ...added]);
    } catch (err: any) {
      alert(`Gagal memproses lampiran: ${err.message}`);
    } finally {
      setAttachmentProcessing(false);
      e.target.value = '';
    }
  };

  const handleMoveExtraAttachment = (idx: number, direction: -1 | 1) => {
    setExtraAttachments((prev) => {
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const handleRemoveExtraAttachment = (id: string) => {
    setExtraAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const selectedInspector = useMemo(
    () => inspectors.find((i) => i.id === selectedInspectorId) || null,
    [inspectors, selectedInspectorId]
  );

  // Sync groundingPoints -> formData.tahananPembumian
  useEffect(() => {
    const joined = groundingPoints
      .map((g) => g.resistanceValue.trim())
      .filter(Boolean)
      .join(', ');
    setFormData((prev) => (prev.tahananPembumian === joined ? prev : { ...prev, tahananPembumian: joined }));
  }, [groundingPoints]);

  // Evaluasi status Grounding real-time
  const groundingEval = useMemo(() => {
    const nums = groundingPoints
      .map((g) => Number(String(g.resistanceValue).replace(',', '.')))
      .filter((n) => !isNaN(n) && String(n) !== '');
    if (nums.length === 0) return { hasValue: false, pass: false, maxVal: 0 };
    const maxVal = Math.max(...nums);
    return { hasValue: true, pass: maxVal <= 5.0, maxVal };
  }, [groundingPoints]);

  // --- AUTO-MIRROR DATA UMUM -> CHECKLIST REMARKS ---
  const buildAutoMirrorMap = (fd: Record<string, any>): Record<string, string> => ({
    'A.1': fd.bentukPenerima ? `${fd.bentukPenerima}` : '',
    'A.2': fd.radiusPerlindungan ? `${fd.radiusPerlindungan}${String(fd.radiusPerlindungan).toLowerCase().includes('meter') ? '' : ' Meter'}` : '',
    'A.3': fd.tinggiTiangPenerima ? (String(fd.tinggiTiangPenerima).includes('±') ? String(fd.tinggiTiangPenerima) : `± ${fd.tinggiTiangPenerima}${String(fd.tinggiTiangPenerima).toLowerCase().includes('meter') ? '' : ' meter'}`) : '',
    'A.4': fd.jumlahAirTerminal ? `${fd.jumlahAirTerminal}` : '',
    'B.1': fd.jumlahDownConductor ? `${fd.jumlahDownConductor}` : '',
    'B.3': fd.luasPenampangHitung ? `${fd.luasPenampangHitung} mm2` : '',
    'B.4': fd.hasilUkurSigmat ? `${fd.hasilUkurSigmat} mm` : '',
    'B.6': fd.tinggiBangunan ? (String(fd.tinggiBangunan).includes('±') ? String(fd.tinggiBangunan) : `± ${fd.tinggiBangunan}${String(fd.tinggiBangunan).toLowerCase().includes('meter') ? '' : ' Meter'}`) : '',
    'B.7': fd.luasBangunan ? `${fd.luasBangunan}` : '',
    'D.3': fd.jumlahBoxKontrol ? `${fd.jumlahBoxKontrol}` : '',
    'E.4': fd.jumlahElektrodaPembumian ? `${fd.jumlahElektrodaPembumian} titik pembumian` : '',
  });

  const applyAutoMirror = (force = false) => {
    const mirror = buildAutoMirrorMap(formData);
    setChecklistRemarks((prev) => {
      const next = { ...prev };
      Object.entries(mirror).forEach(([itemId, val]) => {
        if (val && (force || !editedRemarks[itemId])) {
          next[itemId] = val;
        }
      });
      return next;
    });
  };

  useEffect(() => {
    if (step === 2) {
      applyAutoMirror(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // --- TEMPLATE NARASI BAKU HUKUM ---
  const buildDefaultNarratives = () => {
    const company = formData.companyName || 'Perusahaan';
    const lokasi = formData.lokasiPemasangan || 'area bangunan';
    const jenis = formData.jenisPenyalurPetir || 'Elektrostatis';
    const tool = formData.measuringTool || 'Earth Tester Merk Kyoritsu';
    const groundingListText = groundingPoints
      .filter((g) => g.resistanceValue.trim() !== '')
      .map((g) => `${g.pointName} sebesar ${g.resistanceValue} Ω`)
      .join(', ') || `${formData.tahananPembumian || '-'} Ω`;

    const isPass = groundingEval.hasValue ? groundingEval.pass : true;

    const badItems: string[] = [];
    config?.checklists.categories.forEach((cat) =>
      cat.components.forEach((comp) =>
        comp.items.forEach((it) => {
          if (checklistResults[it.itemId] === 'TIDAK_BAIK') {
            badItems.push(`${it.description}${checklistRemarks[it.itemId] ? ` (${checklistRemarks[it.itemId]})` : ''}`);
          }
        })
      )
    );

    const visualText =
      badItems.length === 0
        ? `Pemeriksaan dokumen teknis dan pemeriksaan visual terhadap komponen Instalasi Penyalur Petir jenis ${jenis} yang terpasang di ${lokasi}, ${company} meliputi Air Terminal (Penerima), Down Conductor (Penghantar Penurunan), Box Kontrol (Test Joint), serta Elektroda Pembumian secara umum dalam kondisi baik, terpasang kokoh, dan sesuai dengan ketentuan keselamatan kerja.`
        : `Pemeriksaan visual terhadap Instalasi Penyalur Petir jenis ${jenis} di ${lokasi}, ${company} menunjukkan sebagian besar komponen terpasang dengan baik, namun ditemukan ketidaksesuaian pada item berikut: ${badItems.join('; ')}.`;

    const measText = `Pengujian tahanan pembumian (grounding) dilakukan menggunakan alat ukur ${tool} dengan hasil pengukuran pada ${groundingListText}. Berdasarkan Permenaker No. Per.02/MEN/1989 Pasal 54 Ayat (1) dan (2), nilai tahanan pembumian maksimal yang dipersyaratkan adalah 5 Ω. Dengan demikian hasil pengukuran tahanan pembumian ${isPass ? 'MEMENUHI' : 'TIDAK MEMENUHI'} persyaratan keselamatan K3.`;

    const concText =
      isPass && badItems.length === 0
        ? `Berdasarkan hasil pemeriksaan visual dan pengujian teknis yang telah dilaksanakan pada Instalasi Penyalur Petir di ${company} (${lokasi}), instalasi dinyatakan MEMENUHI SYARAT KESELAMATAN DAN KESEHATAN KERJA (LAYAK OPERASI) sesuai Permenaker No. Per.02/MEN/1989 dan Permenaker RI No. 31 Tahun 2015.`
        : `Berdasarkan hasil pemeriksaan visual dan pengujian teknis di ${company} (${lokasi}), Instalasi Penyalur Petir dinyatakan BELUM SEPENUHNYA MEMENUHI SYARAT K3 dan memerlukan tindakan perbaikan sebelum dinyatakan laik operasi penuh sesuai Permenaker No. Per.02/MEN/1989.`;

    const recText =
      isPass && badItems.length === 0
        ? `1. Lakukan pemeriksaan dan perawatan berkala pada sambungan test joint di box kontrol agar tetap bersih dan bebas korosi.\n2. Lakukan pemeriksaan dan pengujian ulang (riksa uji berkala) secara periodik setiap 1 (satu) tahun sekali sesuai ketentuan peraturan perundang-undangan K3 yang berlaku.`
        : `1. Segera lakukan perbaikan pada komponen yang tidak memenuhi standar (${!isPass ? 'perbaikan sistem pembumian agar tahanan <= 5 Ω; ' : ''}${badItems.join(', ')}).\n2. Lakukan pengujian ulang setelah perbaikan selesai untuk memastikan pemenuhan batas aman Permenaker No. 02/1989.`;

    return { visualText, measText, concText, recText };
  };

  useEffect(() => {
    if (step === 3 && !visualSummary && !measurementSummary && !conclusion && !recommendations) {
      const def = buildDefaultNarratives();
      setVisualSummary(def.visualText);
      setMeasurementSummary(def.measText);
      setConclusion(def.concText);
      setRecommendations(def.recText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [fieldId]: value };
      if (fieldId === 'hasilUkurSigmat') {
        const d = Number(value);
        if (!isNaN(d) && d > 0) {
          next.luasPenampangHitung = calculateCrossSectionFromSigmat(d);
        }
      }
      return next;
    });
  };

  const handleSetCategoryAllGood = (categoryId: string) => {
    const cat = config?.checklists.categories.find((c) => c.categoryId === categoryId);
    if (!cat) return;
    setChecklistResults((prev) => {
      const next = { ...prev };
      cat.components.forEach((comp) =>
        comp.items.forEach((item) => {
          next[item.itemId] = 'BAIK';
        })
      );
      return next;
    });
  };

  // --- HELPER AMBIL DATAURL FOTO ---
  const resolvePhotoDataUrl = async (p: PhotoItemState): Promise<string> => {
    if (p.dataUrl && p.dataUrl.startsWith('data:image')) return p.dataUrl;
    if (p.driveFileId) {
      const res = await fetch(`${apiBase}/api/photo-proxy?fileId=${p.driveFileId}`);
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
    return '';
  };

  // --- AI VISION OCR ALAT UKUR ---
  const handleRunOcrOnPhoto = async (photo: PhotoItemState) => {
    setOcrLoading(true);
    try {
      const rawUrl = await resolvePhotoDataUrl(photo);
      if (!rawUrl) throw new Error('Foto tidak tersedia.');
      const compressed = await ImageCompressor.compress(rawUrl, 1024, 0.85);
      const res = await fetch(`${apiBase}/api/report?action=vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ocr_meter', imageDataUrl: compressed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal membaca foto alat ukur.');

      const { resistanceValue, toolBrand } = data.data || {};
      if (resistanceValue !== undefined && resistanceValue !== null && String(resistanceValue).trim() !== '') {
        const valStr = String(resistanceValue).trim();
        const num = Number(valStr.replace(',', '.'));
        setGroundingPoints((prev) => {
          if (prev.length === 1 && !prev[0].resistanceValue.trim()) {
            return [{
              ...prev[0],
              resistanceValue: valStr,
              pointRemarks: !isNaN(num) ? (num <= 5.0 ? 'Memenuhi (<= 5 Ω)' : 'Tidak Memenuhi (> 5 Ω)') : prev[0].pointRemarks,
            }];
          }
          return [
            ...prev,
            {
              pointName: `Titik ${prev.length + 1}`,
              resistanceValue: valStr,
              pointRemarks: !isNaN(num) ? (num <= 5.0 ? 'Memenuhi (<= 5 Ω)' : 'Tidak Memenuhi (> 5 Ω)') : '',
            },
          ];
        });
      }
      if (toolBrand) {
        handleFieldChange('measuringTool', toolBrand);
      }
      setShowOcrModal(false);
    } catch (err: any) {
      alert(`AI Vision OCR gagal: ${err.message}`);
    } finally {
      setOcrLoading(false);
    }
  };

  // --- AI POLES NARASI (GEMINI PRO) ---
  const handlePolishNarrativeWithAI = async () => {
    if (!config) return;
    setAiNarrativeLoading(true);
    try {
      const groundingListText = groundingPoints
        .filter((g) => g.resistanceValue.trim())
        .map((g) => `${g.pointName}: ${g.resistanceValue} Ω`)
        .join(', ');
      const badItems: string[] = [];
      config.checklists.categories.forEach((cat) =>
        cat.components.forEach((comp) =>
          comp.items.forEach((it) => {
            if (checklistResults[it.itemId] === 'TIDAK_BAIK') {
              badItems.push(`- ${it.description} (${checklistRemarks[it.itemId] || 'Tidak Baik'})`);
            }
          })
        )
      );

      const contextText = `DATA LAPORAN IPP:
- Perusahaan: ${formData.companyName}
- Lokasi: ${formData.lokasiPemasangan}
- Jenis Penyalur Petir: ${formData.jenisPenyalurPetir} (${formData.bentukPenerima})
- Alat Ukur: ${formData.measuringTool}
- Hasil Grounding: ${groundingListText || formData.tahananPembumian} (Status: ${groundingEval.pass ? 'MEMENUHI <= 5 Ohm' : 'TIDAK MEMENUHI > 5 Ohm'})
- Luas Penampang Down Conductor: ${formData.luasPenampangHitung} mm2 (Sigmat: ${formData.hasilUkurSigmat || '-'} mm)
- Temuan Checklist Tidak Baik: ${badItems.length > 0 ? badItems.join('\n') : 'Tidak ada (Semua Baik)'}
- Draf Catatan Ahli saat ini:
  Visual: ${visualSummary}
  Pengukuran: ${measurementSummary}
  Kesimpulan: ${conclusion}
  Saran: ${recommendations}`;

      const res = await fetch(`${apiBase}/api/report?action=narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelTier: 'pro',
          systemPrompt: `${config.aiPrompts.systemPrompt}\n\n${contextText}`,
          prompts: {
            executiveSummary: 'Poles narasi pemeriksaan dokumen & visual secara umum agar padat, objektif, dan formal.',
            findings: 'Ringkas temuan visual checklist bila ada.',
            testResults: 'Poles narasi hasil pengukuran tahanan pembumian beserta rujukan Permenaker 02/1989 Pasal 54.',
            recommendations: 'Poles poin saran dan rekomendasi K3.',
            conclusion: 'Poles kesimpulan akhir kelayakan K3 sesuai data status.',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal memoles narasi AI.');
      const d = data.data;
      if (d.executiveSummary) setVisualSummary(d.executiveSummary);
      if (d.testResultsNarrative) setMeasurementSummary(d.testResultsNarrative);
      if (d.conclusion) setConclusion(d.conclusion);
      if (d.recommendations) setRecommendations(d.recommendations);
    } catch (err: any) {
      alert(`Gagal memoles narasi: ${err.message}`);
    } finally {
      setAiNarrativeLoading(false);
    }
  };

  // --- AI AUTO-SORTIR & CAPTION FOTO (GEMINI FLASH) ---
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
            tahananPembumian: formData.tahananPembumian,
            measuringTool: formData.measuringTool,
            lokasiPemasangan: formData.lokasiPemasangan,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menyusun foto otomatis.');
      const items: Array<{ id: string; caption: string; isJointPhoto?: boolean }> = data.data?.items || [];
      setPhotos((prev) =>
        prev.map((p) => {
          const match = items.find((it) => it.id === p.id);
          if (!match) return p;
          return {
            ...p,
            caption: match.caption || p.caption,
            isJointPhoto: Boolean(match.isJointPhoto),
            selectedForGrid: !match.isJointPhoto,
          };
        })
      );
    } catch (err: any) {
      alert(`Gagal menyusun foto otomatis: ${err.message}`);
    } finally {
      setAiPhotoLoading(false);
    }
  };

  // --- PRE-FLIGHT QC KELENGKAPAN ---
  const missingFields = useMemo(() => {
    const keys: Array<{ key: string; label: string }> = [
      { key: 'companyName', label: 'Nama Perusahaan' },
      { key: 'companyAddress', label: 'Alamat Perusahaan' },
      { key: 'tinggiTiangPenerima', label: 'Tinggi Tiang Penerima' },
      { key: 'tinggiBangunan', label: 'Tinggi Bangunan' },
      { key: 'radiusPerlindungan', label: 'Radius Perlindungan' },
      { key: 'lokasiPemasangan', label: 'Lokasi Pemasangan' },
      { key: 'tahananPembumian', label: 'Nilai Tahanan Pembumian' },
    ];
    return keys.filter((k) => !String(formData[k.key] || '').trim());
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
            formData,
            groundingPoints,
            visualSummary,
            measurementSummary,
            conclusion,
          },
        }),
      });
      const data = await res.json();
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
      const calcResult = FormulaEngine.calculate('IPP', formData);

      // Siapkan checklistSections (A-E) & continuityItems
      const checklistSections: any[] = [];
      const continuityItems: any[] = [];
      const componentsForDb: any[] = [];

      config?.checklists.categories.forEach((cat) => {
        if (cat.categoryId === 'hubungan_antar_bagian') {
          cat.components.forEach((comp) => {
            comp.items.forEach((item, idx) => {
              const res = checklistResults[item.itemId] || 'BAIK';
              continuityItems.push({
                itemId: item.itemId,
                no: idx + 1,
                description: item.description,
                result: res,
                checkBaik: res === 'BAIK' ? '√' : '-',
                checkTidakBaik: res === 'TIDAK_BAIK' ? '√' : '-',
                remarks: checklistRemarks[item.itemId] || '',
              });
            });
          });
        } else {
          const [letterPart, ...titleParts] = cat.categoryName.split('. ');
          const sectionLetter = letterPart || '';
          const sectionTitle = titleParts.join('. ') || cat.categoryName;
          const items: any[] = [];
          cat.components.forEach((comp) => {
            comp.items.forEach((item, idx) => {
              const res = checklistResults[item.itemId] || 'BAIK';
              items.push({
                itemId: item.itemId,
                no: idx + 1,
                description: item.description,
                result: res,
                checkBaik: res === 'BAIK' ? '√' : '-',
                checkTidakBaik: res === 'TIDAK_BAIK' ? '√' : '-',
                remarks: checklistRemarks[item.itemId] || '',
              });
            });
            componentsForDb.push({
              componentId: comp.componentId,
              componentName: comp.componentName,
              category: cat.categoryName,
              items,
            });
          });
          checklistSections.push({ sectionLetter, sectionTitle, items });
        }
      });

      // Kompresi foto grid & foto bersama
      const gridSelected = photos.filter((p) => p.selectedForGrid && !p.isJointPhoto);
      const compressedGrid = await Promise.all(
        gridSelected.map(async (p) => ({
          caption: p.caption || '',
          dataUrl: await ImageCompressor.compress(await resolvePhotoDataUrl(p), 900, 0.78),
        }))
      );

      const jointItem = photos.find((p) => p.isJointPhoto);
      const jointPhotoDataUrl = jointItem
        ? await ImageCompressor.compress(await resolvePhotoDataUrl(jointItem), 1200, 0.82)
        : '';

      const cloudId = initialReportData?.cloudId || `IPP_${selectedInspection?.id || Date.now()}`;

      const reportPayload = {
        cloudId,
        inspectionId: selectedInspection?.id || '',
        reportNumber: reportNumber.trim(),
        inspectionTypeCode: 'IPP',
        exportFormat: format,
        configVersion: '2.0.0',
        status: 'generating',
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
          groundingPoints: groundingPoints.map((g, idx) => ({
            no: idx + 1,
            pointName: g.pointName?.trim() || `Titik ${idx + 1}`,
            resistanceValue: g.resistanceValue?.trim() || '-',
            pointRemarks: g.pointRemarks?.trim() || '-',
          })),
        },
        checklistData: {
          configVersion: '2.0.0',
          checklistSections,
          continuityItems,
          components: componentsForDb,
          continuity: continuityItems,
          overallResult: groundingEval.pass ? 'LAIK' : 'PERLU_PERBAIKAN',
        },
        formulaResults: calcResult,
        aiNarrative: {
          sections: {
            visualSummary: visualSummary || '',
            measurementSummary: measurementSummary || '',
            conclusion: conclusion || '',
            recommendations: recommendations || '',
            executiveSummary: visualSummary || '',
            findingsNarrative: visualSummary || '',
            testResultsNarrative: measurementSummary || '',
          },
        },
        photoDocumentation: {
          photos: compressedGrid,
          jointPhoto: jointPhotoDataUrl,
        },
        extraAttachments: extraAttachments.map((att) => ({
          image: att.dataUrl,
          sourceFileName: att.sourceFileName,
          pageNumber: att.pageNumber,
        })),
        updatedAt: new Date().toISOString(),
      };

      let localId: number;
      if (reportId) {
        await db.reports.put({ ...reportPayload, id: reportId });
        localId = reportId;
      } else {
        localId = await db.reports.add({ ...reportPayload, createdAt: new Date().toISOString() });
      }

      const res = await fetch(`${apiBase}/api/report?action=generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: localId, reportData: reportPayload }),
      });

      const data = await res.json();
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

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Sticky Header + 4-Step Progress */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-extrabold">
                  IPP
                </span>
                <h2 className="text-sm font-extrabold text-gray-900 truncate">
                  {formData.companyName || 'Laporan Penyalur Petir'}
                </h2>
              </div>
              {onChangeSource && (
                <button
                  type="button"
                  onClick={onChangeSource}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline"
                >
                  ↻ Ganti Sesi Inspeksi
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200"
            >
              Tutup
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 1, label: '1. Data Umum' },
              { id: 2, label: '2. Ukur & Cek' },
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
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* ================= STEP 1 ================= */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Nomor Laporan & Tanggal */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                Identitas Laporan & Ahli K3
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
                    placeholder="Contoh: 116 / ARP / IPP / XI / 2026"
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Tanggal Periksa</label>
                  <input
                    type="date"
                    value={formData.inspectionDate}
                    onChange={(e) => handleFieldChange('inspectionDate', e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Tanggal Terbit Laporan</label>
                  <input
                    type="date"
                    value={formData.reportDate}
                    onChange={(e) => handleFieldChange('reportDate', e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Nama Perusahaan *</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => handleFieldChange('companyName', e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Alamat Perusahaan</label>
                  <input
                    type="text"
                    value={formData.companyAddress}
                    onChange={(e) => handleFieldChange('companyAddress', e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                  />
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

            {/* Accordion 1: Identitas Penyalur Petir */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion(openAccordion === 'identitas' ? 'dimensi' : 'identitas')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 text-left"
              >
                <span className="text-xs font-extrabold text-gray-800">
                  1. Identitas Penyalur Petir (6 Kolom)
                </span>
                <span className="text-xs text-gray-500">{openAccordion === 'identitas' ? '▲' : '▼'}</span>
              </button>
              {openAccordion === 'identitas' && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Jenis Alat</label>
                    <input
                      type="text"
                      value={formData.jenisAlat}
                      onChange={(e) => handleFieldChange('jenisAlat', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Jenis Penyalur Petir</label>
                    <div className="flex gap-2">
                      {['Elektrostatis', 'Konvensional'].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleFieldChange('jenisPenyalurPetir', opt)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                            formData.jenisPenyalurPetir === opt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-700 border-gray-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Bentuk Penerima</label>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {['Bulat Runcing', 'Runcing', 'Multi-point'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleFieldChange('bentukPenerima', chip)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                            formData.bentukPenerima === chip
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
                      value={formData.bentukPenerima}
                      onChange={(e) => handleFieldChange('bentukPenerima', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Merk / Type</label>
                      <input
                        type="text"
                        value={formData.merkType}
                        onChange={(e) => handleFieldChange('merkType', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Tahun Pemasangan</label>
                      <input
                        type="text"
                        value={formData.tahunPemasangan}
                        onChange={(e) => handleFieldChange('tahunPemasangan', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Radius Perlindungan</label>
                    <input
                      type="text"
                      value={formData.radiusPerlindungan}
                      onChange={(e) => handleFieldChange('radiusPerlindungan', e.target.value)}
                      placeholder="Contoh: 70 Meter"
                      className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 2: Dimensi & Penghantar + Kalkulator Sigmat */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion(openAccordion === 'dimensi' ? 'konstruksi' : 'dimensi')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 text-left"
              >
                <span className="text-xs font-extrabold text-gray-800">
                  2. Dimensi, Penghantar & Kalkulator Sigmat
                </span>
                <span className="text-xs text-gray-500">{openAccordion === 'dimensi' ? '▲' : '▼'}</span>
              </button>
              {openAccordion === 'dimensi' && (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Tinggi Tiang Penerima</label>
                      <input
                        type="text"
                        value={formData.tinggiTiangPenerima}
                        onChange={(e) => handleFieldChange('tinggiTiangPenerima', e.target.value)}
                        placeholder="± 5 meter"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Tinggi Bangunan</label>
                      <input
                        type="text"
                        value={formData.tinggiBangunan}
                        onChange={(e) => handleFieldChange('tinggiBangunan', e.target.value)}
                        placeholder="± 77 Meter"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Jumlah Air Terminal</label>
                      <input
                        type="text"
                        value={formData.jumlahAirTerminal}
                        onChange={(e) => handleFieldChange('jumlahAirTerminal', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Diameter Tiang Penerima</label>
                      <input
                        type="text"
                        value={formData.diameterTiangPenerima}
                        onChange={(e) => handleFieldChange('diameterTiangPenerima', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Jumlah Box Kontrol</label>
                      <input
                        type="text"
                        value={formData.jumlahBoxKontrol}
                        onChange={(e) => handleFieldChange('jumlahBoxKontrol', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Jumlah Elektroda Bumi</label>
                      <input
                        type="text"
                        value={formData.jumlahElektrodaPembumian}
                        onChange={(e) => handleFieldChange('jumlahElektrodaPembumian', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Jumlah Penghantar Penurunan</label>
                      <input
                        type="text"
                        value={formData.jumlahDownConductor}
                        onChange={(e) => handleFieldChange('jumlahDownConductor', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">Jenis Penghantar Penurunan</label>
                      <input
                        type="text"
                        value={formData.jenisDownConductor}
                        onChange={(e) => handleFieldChange('jenisDownConductor', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Kalkulator Sigmat */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                    <p className="text-[11px] font-extrabold text-emerald-900">
                      Kalkulator Sigmat (A = ¼ × 3.14 × d²)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-emerald-800 mb-1">
                          Diameter Sigmat (mm)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.hasilUkurSigmat}
                          onChange={(e) => handleFieldChange('hasilUkurSigmat', e.target.value)}
                          placeholder="8.24"
                          className="w-full px-3 py-2 text-xs bg-white border border-emerald-300 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-emerald-800 mb-1">
                          Luas Penampang (mm²) — Editable
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.luasPenampangHitung}
                          onChange={(e) => handleFieldChange('luasPenampangHitung', e.target.value)}
                          className="w-full px-3 py-2 text-xs font-bold bg-white border border-emerald-300 rounded-xl"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-700">
                      Standar min. Permenaker 02/1989: 50 mm² — Status:{' '}
                      <strong>{Number(formData.luasPenampangHitung || 0) >= 50 ? 'MEMENUHI' : 'DI BAWAH 50 mm²'}</strong>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 3: Konstruksi & Lokasi Bangunan */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenAccordion(openAccordion === 'konstruksi' ? 'identitas' : 'konstruksi')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 text-left"
              >
                <span className="text-xs font-extrabold text-gray-800">
                  3. Konstruksi & Lokasi Bangunan (6 Kolom)
                </span>
                <span className="text-xs text-gray-500">{openAccordion === 'konstruksi' ? '▲' : '▼'}</span>
              </button>
              {openAccordion === 'konstruksi' && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Luas Bangunan</label>
                    <input
                      type="text"
                      value={formData.luasBangunan}
                      onChange={(e) => handleFieldChange('luasBangunan', e.target.value)}
                      placeholder="- atau 2500 m²"
                      className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>

                  {[
                    { key: 'jenisKonstruksi', label: 'Jenis Konstruksi Bangunan', chips: ['Coran', 'Baja', 'Beton Bertulang'] },
                    { key: 'atapBangunan', label: 'Atap Bangunan', chips: ['Coran', 'Seng', 'Spandek', 'Genteng'] },
                    { key: 'dindingBangunan', label: 'Dinding Bangunan', chips: ['Tembokan', 'Beton', 'Seng', 'Kaca'] },
                    { key: 'lantaiBangunan', label: 'Lantai Bangunan', chips: ['Coran', 'Keramik', 'Epoxy'] },
                  ].map((item) => (
                    <div key={item.key}>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">{item.label}</label>
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {item.chips.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => handleFieldChange(item.key, c)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                              formData[item.key] === c
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={formData[item.key]}
                        onChange={(e) => handleFieldChange(item.key, e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                  ))}

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Lokasi Pemasangan *</label>
                    <input
                      type="text"
                      value={formData.lokasiPemasangan}
                      onChange={(e) => handleFieldChange('lokasiPemasangan', e.target.value)}
                      placeholder="Rooftop Apartemen Tower A"
                      className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= STEP 2 ================= */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Pengukuran Tahanan Pembumian */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                  Pengukuran Tahanan Pembumian
                </h3>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                    !groundingEval.hasValue
                      ? 'bg-gray-100 text-gray-600'
                      : groundingEval.pass
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {!groundingEval.hasValue
                    ? 'BELUM DIISI'
                    : groundingEval.pass
                    ? `MEMENUHI (${groundingEval.maxVal} Ω <= 5 Ω)`
                    : `TIDAK MEMENUHI (${groundingEval.maxVal} Ω > 5 Ω)`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Alat Ukur</label>
                  <input
                    type="text"
                    value={formData.measuringTool}
                    onChange={(e) => handleFieldChange('measuringTool', e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
                {photos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOcrModal(true)}
                    className="mt-5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100"
                  >
                    📷 Baca dari Foto Alat Ukur
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {groundingPoints.map((pt, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded-xl border border-gray-200">
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={pt.pointName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGroundingPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, pointName: val } : p)));
                        }}
                        placeholder="Titik 1"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={pt.resistanceValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          const num = Number(val.replace(',', '.'));
                          setGroundingPoints((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? {
                                    ...p,
                                    resistanceValue: val,
                                    pointRemarks: !isNaN(num) && val.trim() !== ''
                                      ? num <= 5.0
                                        ? 'Memenuhi (<= 5 Ω)'
                                        : 'Tidak Memenuhi (> 5 Ω)'
                                      : p.pointRemarks,
                                  }
                                : p
                            )
                          );
                        }}
                        placeholder="1.39"
                        className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-gray-200 rounded-lg"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={pt.pointRemarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGroundingPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, pointRemarks: val } : p)));
                        }}
                        placeholder="Keterangan"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {groundingPoints.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setGroundingPoints((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-500 text-xs font-bold px-1.5 py-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setGroundingPoints((prev) => [
                      ...prev,
                      { pointName: `Titik ${prev.length + 1}`, resistanceValue: '', pointRemarks: 'Memenuhi (<= 5 Ω)' },
                    ])
                  }
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold"
                >
                  + Tambah Titik Pengukuran
                </button>
              </div>
            </div>

            {/* Checklist A-E & Kontinuitas */}
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-extrabold text-gray-700 uppercase">Checklist Pemeriksaan Fisik</p>
              <button
                type="button"
                onClick={() => applyAutoMirror(true)}
                className="text-[11px] font-bold text-emerald-600 hover:underline"
              >
                ↻ Sinkron Keterangan dari Data Umum
              </button>
            </div>

            {config?.checklists.categories.map((cat) => (
              <div key={cat.categoryId} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-gray-800">{cat.categoryName}</span>
                  <button
                    type="button"
                    onClick={() => handleSetCategoryAllGood(cat.categoryId)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-extrabold hover:bg-emerald-200 shrink-0"
                  >
                    ✓ Set Semua Baik
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {cat.components.flatMap((comp) =>
                    comp.items.map((item) => {
                      const val = checklistResults[item.itemId] || 'BAIK';
                      return (
                        <div key={item.itemId} className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-gray-800">
                              <span className="text-gray-400 font-mono mr-1.5">{item.itemId}</span>
                              {item.description}
                            </p>
                            <div className="flex gap-1 shrink-0">
                              {[
                                { k: 'BAIK', label: '√ Baik', cls: 'bg-emerald-600 text-white' },
                                { k: 'TIDAK_BAIK', label: '✕ Tidak', cls: 'bg-red-600 text-white' },
                                { k: 'NA', label: '- N/A', cls: 'bg-gray-600 text-white' },
                              ].map((btn) => (
                                <button
                                  key={btn.k}
                                  type="button"
                                  onClick={() => setChecklistResults((prev) => ({ ...prev, [item.itemId]: btn.k as any }))}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                                    val === btn.k ? `${btn.cls} border-transparent` : 'bg-white text-gray-600 border-gray-200'
                                  }`}
                                >
                                  {btn.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="text"
                            value={checklistRemarks[item.itemId] || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditedRemarks((prev) => ({ ...prev, [item.itemId]: true }));
                              setChecklistRemarks((prev) => ({ ...prev, [item.itemId]: v }));
                            }}
                            placeholder="Keterangan (opsional)..."
                            className="w-full px-2.5 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded-lg"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================= STEP 3 ================= */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                  Narasi Laporan (Bisa Edit Manual)
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const def = buildDefaultNarratives();
                      setVisualSummary(def.visualText);
                      setMeasurementSummary(def.measText);
                      setConclusion(def.concText);
                      setRecommendations(def.recText);
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
                    {aiNarrativeLoading ? 'Memoles...' : '✨ Poles Narasi AI (Pro)'}
                  </button>
                </div>
              </div>

              {[
                { label: 'Pemeriksaan Dokumen & Visual', val: visualSummary, set: setVisualSummary, rows: 3 },
                { label: 'Hasil Pengukuran Pembumian', val: measurementSummary, set: setMeasurementSummary, rows: 3 },
                { label: 'Kesimpulan Kelayakan K3', val: conclusion, set: setConclusion, rows: 3 },
                { label: 'Saran & Rekomendasi', val: recommendations, set: setRecommendations, rows: 4 },
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

            {/* Pemilih Foto Dokumentasi */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                    Dokumentasi Foto ({photos.filter((p) => p.selectedForGrid && !p.isJointPhoto).length} Grid + {photos.some((p) => p.isJointPhoto) ? '1 Bersama' : '0 Bersama'})
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Pilih foto untuk grid 3 kolom dan 1 foto khusus dokumentasi bersama pihak perusahaan.
                  </p>
                </div>
                {photos.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoCategorizePhotos}
                    disabled={aiPhotoLoading}
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold"
                  >
                    {aiPhotoLoading ? 'Menyusun...' : '✨ Susun & Caption AI'}
                  </button>
                )}
              </div>

              {photos.length > 0 && !photos.some((p) => p.isJointPhoto) && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-semibold">
                  ⚠️ Belum ada foto yang ditandai sebagai <strong>Foto Bersama Pihak Perusahaan</strong>. Klik tombol{' '}
                  <span className="font-bold">☆ Bersama</span> pada salah satu foto agar bagian tersebut tidak kosong di laporan.
                </div>
              )}

              {photos.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  Tidak ada foto pada sesi inspeksi ini.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      className={`p-2.5 rounded-xl border space-y-2 ${
                        p.isJointPhoto
                          ? 'border-amber-400 bg-amber-50'
                          : p.selectedForGrid
                          ? 'border-emerald-400 bg-emerald-50/40'
                          : 'border-gray-200 bg-gray-50 opacity-70'
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={p.dataUrl || `${apiBase}/api/photo-proxy?fileId=${p.driveFileId}`}
                          alt={p.caption}
                          className="w-full h-36 object-cover rounded-lg bg-gray-200"
                        />
                        <div className="absolute top-2 right-2 flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setPhotos((prev) =>
                                prev.map((item) =>
                                  item.id === p.id
                                    ? { ...item, selectedForGrid: !item.selectedForGrid, isJointPhoto: false }
                                    : item
                                )
                              )
                            }
                            className={`px-2 py-1 rounded-md text-[10px] font-bold shadow ${
                              p.selectedForGrid && !p.isJointPhoto
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white/90 text-gray-700'
                            }`}
                          >
                            {p.selectedForGrid && !p.isJointPhoto ? '✓ Grid' : '+ Grid'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPhotos((prev) =>
                                prev.map((item) =>
                                  item.id === p.id
                                    ? { ...item, isJointPhoto: !item.isJointPhoto, selectedForGrid: false }
                                    : { ...item, isJointPhoto: false }
                                )
                              )
                            }
                            className={`px-2 py-1 rounded-md text-[10px] font-bold shadow ${
                              p.isJointPhoto ? 'bg-amber-600 text-white' : 'bg-white/90 text-gray-700'
                            }`}
                          >
                            {p.isJointPhoto ? '★ Foto Bersama' : '☆ Bersama'}
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={p.caption}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPhotos((prev) => prev.map((item) => (item.id === p.id ? { ...item, caption: v } : item)));
                        }}
                        placeholder="Caption foto..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lampiran Tambahan (PDF / Gambar Multi-Halaman) */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                    Lampiran Tambahan (PDF / Gambar) — Opsional ({extraAttachments.length} hal.)
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Bisa pilih multi-file PDF multi-halaman atau foto. Otomatis digabung ke halaman lampiran ukuran Folio.
                  </p>
                </div>
                <label className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 cursor-pointer shrink-0">
                  {attachmentProcessing ? 'Memproses Halaman...' : '+ Tambah Lampiran (PDF / Foto)'}
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={handleAddExtraAttachments}
                    disabled={attachmentProcessing}
                    className="hidden"
                  />
                </label>
              </div>

              {extraAttachments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  Belum ada lampiran tambahan (sertifikat alat, surat tugas, denah, dll.).
                </p>
              ) : (
                <div className="space-y-2">
                  {extraAttachments.map((att, idx) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={att.dataUrl}
                          alt={`${att.sourceFileName} Hal ${att.pageNumber}`}
                          className="w-12 h-16 object-cover rounded-lg border border-gray-300 bg-white shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {idx + 1}. {att.sourceFileName}
                          </p>
                          <p className="text-[11px] text-gray-500">Halaman {att.pageNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveExtraAttachment(idx, -1)}
                          title="Geser ke atas"
                          className="px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-bold disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === extraAttachments.length - 1}
                          onClick={() => handleMoveExtraAttachment(idx, 1)}
                          title="Geser ke bawah"
                          className="px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-bold disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveExtraAttachment(att.id)}
                          title="Hapus halaman"
                          className="px-2 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= STEP 4 ================= */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                  Ringkasan & Kelengkapan Laporan
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

              {(missingFields.length > 0 || (photos.length > 0 && !photos.some((p) => p.isJointPhoto))) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                  {missingFields.length > 0 && (
                    <>
                      <p className="font-bold">⚠️ Beberapa kolom Data Umum masih kosong:</p>
                      <p className="text-[11px]">{missingFields.map((m) => m.label).join(', ')}</p>
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="text-[11px] font-bold underline block"
                      >
                        Lengkapi di Langkah 1 →
                      </button>
                    </>
                  )}
                  {photos.length > 0 && !photos.some((p) => p.isJointPhoto) && (
                    <div className="pt-1">
                      <p className="font-bold">⚠️ Foto Bersama Pihak Perusahaan belum dipilih.</p>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="text-[11px] font-bold underline"
                      >
                        Tandai 1 foto di Langkah 3 →
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

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[10px] text-gray-500">Nomor Laporan</p>
                  <p className="font-bold text-gray-900">{reportNumber || '-'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[10px] text-gray-500">Ahli K3 Pemeriksa</p>
                  <p className="font-bold text-gray-900">{selectedInspector?.name || '-'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[10px] text-gray-500">Tahanan Pembumian</p>
                  <p className={`font-bold ${groundingEval.pass ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formData.tahananPembumian || '-'} Ω ({groundingEval.pass ? 'MEMENUHI' : 'TIDAK MEMENUHI'})
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[10px] text-gray-500">Dokumentasi & Lampiran</p>
                  <p className="font-bold text-gray-900">
                    {photos.filter((p) => p.selectedForGrid && !p.isJointPhoto).length} Grid,{' '}
                    {photos.some((p) => p.isJointPhoto) ? '1' : '0'} Bersama,{' '}
                    {extraAttachments.length} Hal. Tambahan
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
                    ✅ Laporan berhasil dibuat & disimpan di Google Drive!
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
      </div>

      {/* Bottom Sticky Navigation Bar (Mobile-First Thumb Zone) */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
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
      </div>

      {/* Modal Pilih Foto untuk AI Vision OCR */}
      {showOcrModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold text-gray-800">
                Pilih Foto Layar Earth Tester untuk Dibaca AI
              </h4>
              <button
                type="button"
                onClick={() => setShowOcrModal(false)}
                className="text-xs font-bold text-gray-500"
              >
                ✕
              </button>
            </div>
            {ocrLoading ? (
              <p className="text-xs text-center py-8 font-bold text-indigo-600">
                ⏳ Membaca angka alat ukur dengan Gemini Flash...
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
                      src={p.dataUrl || `${apiBase}/api/photo-proxy?fileId=${p.driveFileId}`}
                      alt={p.caption}
                      className="w-full h-28 object-cover"
                    />
                    <p className="p-1.5 text-[10px] font-semibold text-gray-600 truncate">{p.caption}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
