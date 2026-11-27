// src/components/report/ReportWizard.tsx
import { useState, useEffect, useMemo } from 'react';
import { db, SessionRepository } from '../../db/db';
import { getConfigByCode, mapObjectTypeToCode } from '../../report-configs/registry';
import { FormulaEngine } from '../../engines/FormulaEngine';
import { ValidationEngine } from '../../engines/ValidationEngine';
import { ImageCompressor } from '../../engines/ImageCompressor';
import { SequenceGenerator } from '../../engines/SequenceGenerator';
import { getApiBaseUrl } from '../../config';
import { registerBackInterceptor } from '../../utils/navigationGuard';
import { IppReportWizard } from './IppReportWizard';
import { IlReportWizard } from './IlReportWizard';
import {
  AttachmentSectionCard,
  mapInitialAttachments,
  type AttachmentPageItem,
} from './AttachmentSectionCard';
import { ReportWorkspaceLayout } from './preview/ReportWorkspaceLayout';
import type { ReportPreviewData } from '../../utils/reportTemplatePayload';
import {
  DocumentationPhotoPicker,
  buildPhotoSelectionMeta,
  getJointDocPhoto,
  getOrderedDocPhotos,
  initDocPhotos,
  resolveDocPhotoDataUrl,
  type DocPhotoItemState,
} from './DocumentationPhotoPicker';

interface ReportWizardProps {
  reportId: number | null; // null jika buat baru
  onClose: () => void;
}

export function ReportWizard({ reportId, onClose }: ReportWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [inspectionsList, setInspectionsList] = useState<any[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<any>(null);
  
  // Wizard State
  const [formData, setFormData] = useState<Record<string, any>>({
    companyName: '',
    companyAddress: '',
    inspectionDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
    reportDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
    
    // Default values for IL / IPP
    sumberTegangan: 'PLN',
    jumlahPhasa: '3 Phase',
    frekuensi: 50,
    jenisArus: 'AC',
    teganganKerja: 380,
    jenisProteksiUtama: 'MCCB',
    ratingProteksiUtama: 0,
    
    jenisPenyalurPetir: 'Konvensional',
    bentukPenerima: 'Runcing',
    jumlahAirTerminal: 1,
    tinggiTiangPenerima: 0,
    tinggiBangunan: 0,
    jumlahDownConductor: 1,
    jenisDownConductor: 'Kabel BC 50 mm2',
    ukuranDownConductor: 50,
    jumlahBoxKontrol: 1,
    jumlahElektrodaPembumian: 1
  });

  const [checklistResponses, setChecklistResponses] = useState<Record<string, 'BAIK' | 'KURANG' | 'TIDAK_ADA' | 'NA'>>({});
  const [checklistRemarks, setChecklistRemarks] = useState<Record<string, string>>({});
  
  const [calculations, setCalculations] = useState<any>(null);
  const [aiNarrative, setAiNarrative] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<DocPhotoItemState[]>([]);
  const [bapAttachments, setBapAttachments] = useState<AttachmentPageItem[]>([]);
  const [extraAttachments, setExtraAttachments] = useState<AttachmentPageItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<string>('');
  const [genLink, setGenLink] = useState<string>('');
  const [reportNum, setReportNum] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);

  // Tipe inspeksi terdeteksi dari source
  const [typeCode, setTypeCode] = useState<string>('IL');
  const [loadedReportData, setLoadedReportData] = useState<any>(null);

  const isDelegatedToSpecialist =
    (typeCode === 'IPP' || typeCode === 'IL') && Boolean(selectedInspection) && currentStep >= 2;

  useEffect(() => {
    if (isDelegatedToSpecialist) return;
    const unregister = registerBackInterceptor(() => {
      if (currentStep > 1) {
        setCurrentStep(prev => prev - 1);
        return true;
      }
      if (confirm('Tutup wizard laporan? Data yang belum di-generate akan dibatalkan.')) {
        onClose();
      }
      return true;
    });
    return unregister;
  }, [currentStep, onClose, isDelegatedToSpecialist]);

  useEffect(() => {
    loadSourceInspections();
    if (reportId) {
      loadExistingReport(reportId);
    }
  }, [reportId]);

  const loadSourceInspections = async () => {
    const list = await SessionRepository.getHistory();
    setInspectionsList(list);
  };

  const loadExistingReport = async (id: number) => {
    try {
      const rep = await db.reports.get(id);
      if (rep) {
        setLoadedReportData(rep);
        setFormData({
          ...rep.generalData,
          ...rep.technicalData,
          ...rep.testingData?.measurements?.reduce((acc: any, curr: any) => {
            acc[curr.measurementId] = curr.value;
            return acc;
          }, {})
        });
        
        setTypeCode(rep.inspectionTypeCode);
        setReportNum(rep.reportNumber);
        
        // Checklist (komponen utama + continuity)
        const checkMap: Record<string, any> = {};
        const remarkMap: Record<string, string> = {};
        rep.checklistData?.components?.forEach((c: any) => {
          c.items?.forEach((item: any) => {
            checkMap[item.itemId] = item.result;
            remarkMap[item.itemId] = item.remarks || '';
          });
        });
        rep.checklistData?.continuity?.forEach((item: any) => {
          checkMap[item.itemId] = item.result;
          remarkMap[item.itemId] = item.remarks || '';
        });
        setChecklistResponses(checkMap);
        setChecklistRemarks(remarkMap);
        
        setCalculations(rep.formulaResults);
        setAiNarrative(rep.aiNarrative?.sections);
        setBapAttachments(mapInitialAttachments(rep.bapAttachments, 'bap'));
        setExtraAttachments(mapInitialAttachments(rep.extraAttachments, 'extra'));
        
        // Photos
        const sourceInsp = rep.inspectionId ? await SessionRepository.getById(rep.inspectionId) : null;
        if (sourceInsp) {
          setSelectedInspection(sourceInsp);
          setSelectedPhotos(initDocPhotos(sourceInsp.photos || [], rep));
        } else {
          // Fallback jika laporan di-sync dari cloud ke device baru yang belum memiliki sesi inspeksi lokal
          setSelectedInspection({
            id: rep.inspectionId || '',
            clientName: rep.generalData?.companyName || '',
            objectType: rep.inspectionTypeCode === 'IPP' ? 'Penyalur Petir' : 'Instalasi Listrik',
            unitData: rep.technicalData || {},
            photos: [],
          });
          setSelectedPhotos(initDocPhotos([], rep));
        }
        
        setCurrentStep(2); // langsung ke data umum jika edit
      }
    } catch (err) {
      console.error('Gagal memuat detail laporan:', err);
    }
  };

  const handleSelectInspection = (insp: any) => {
    setSelectedInspection(insp);
    const resolvedCode = mapObjectTypeToCode(insp.objectType);
    setTypeCode(resolvedCode);

    const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const inspDate = insp.unitData?.tanggal_inspeksi || insp.tanggal_inspeksi || todayIso;

    // Reset state wizard agar tidak ada sisa laporan sebelumnya
    setReportNum('');
    setCalculations(null);
    setAiNarrative(null);
    setBapAttachments([]);
    setExtraAttachments([]);
    setGenLink('');
    setGenStatus('');
    setErrors([]);
    setChecklistRemarks({});

    // Prefill data dari config defaults & data inspeksi
    const nextConfig = getConfigByCode(resolvedCode);
    const configDefaults: Record<string, any> = {};
    nextConfig?.forms.forEach((f) => {
      if (f.defaultValue !== undefined) configDefaults[f.fieldId] = f.defaultValue;
    });

    setFormData({
      ...configDefaults,
      companyName: insp.clientName || '',
      companyAddress: insp.unitData?.alamatPerusahaan || insp.unitData?.lokasiUnit || '',
      inspectionDate: inspDate,
      reportDate: todayIso,
      ...insp.unitData,
    });

    // Reset checklist & photos
    if (nextConfig) {
      const initialCheck: Record<string, any> = {};
      nextConfig.checklists.categories.forEach(cat => {
        cat.components.forEach(comp => {
          comp.items.forEach(item => {
            initialCheck[item.itemId] = 'BAIK';
          });
        });
      });
      setChecklistResponses(initialCheck);
    }

    setSelectedPhotos(initDocPhotos(insp.photos || []));
    setCurrentStep(2);
  };

  const config = getConfigByCode(typeCode);

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleChecklistResult = (itemId: string, result: 'BAIK' | 'KURANG' | 'TIDAK_ADA' | 'NA') => {
    setChecklistResponses(prev => ({ ...prev, [itemId]: result }));
  };

  const handleChecklistRemark = (itemId: string, remark: string) => {
    setChecklistRemarks(prev => ({ ...prev, [itemId]: remark }));
  };

  // Validasi & Hitung Formula di Step 5 -> 6
  const handleProceedToCalculations = () => {
    // 1. Jalankan Validation Engine
    const valResult = ValidationEngine.validate(typeCode, formData);
    if (!valResult.isValid) {
      setErrors(valResult.errors.map(e => e.errorMessage));
      return;
    }
    setErrors([]);

    // 2. Jalankan Formula Engine
    const calcResult = FormulaEngine.calculate(typeCode, formData);
    setCalculations(calcResult);
    setCurrentStep(6);
  };

  // Generate AI Narrative
  const generateNarrative = async () => {
    if (!config) return;
    setAiLoading(true);

    try {
      const apiBase = getApiBaseUrl();
      
      // Temukan temuan visual bermasalah
      const visualFaults: string[] = [];
      config.checklists.categories.forEach(cat => {
        cat.components.forEach(comp => {
          comp.items.forEach(item => {
            const res = checklistResponses[item.itemId];
            if (res === 'KURANG' || res === 'TIDAK_ADA') {
              visualFaults.push(`- ${item.description}: ${res === 'KURANG' ? 'Kurang Baik' : 'Tidak Ada'}. Catatan: ${checklistRemarks[item.itemId] || '-'}`);
            }
          });
        });
      });

      // Format template prompts dengan data riil
      const rawContext = config.aiPrompts.contextTemplate;
      const values: Record<string, any> = {
        companyName: formData.companyName,
        namaPanel: formData.namaPanel || formData.lokasiPemasangan || 'Unit Utama',
        teganganKerja: formData.teganganKerja || 380,
        jenisProteksiUtama: formData.jenisProteksiUtama || 'MCCB',
        ratingProteksiUtama: formData.ratingProteksiUtama || 0,
        bebanR: formData.bebanR || 0,
        bebanS: formData.bebanS || 0,
        bebanT: formData.bebanT || 0,
        avgBeban: calculations?.calculations?.find((c: any) => c.formulaId === 'arus_nominal')?.result || 0,
        unbalancePercent: calculations?.calculations?.find((c: any) => c.formulaId === 'keseimbangan_beban')?.result || 0,
        tahananPembumian: formData.tahananPembumian || formData.tahananPentanahan || 0,
        isolasiRN: formData.isolasiRN || 0,
        isolasiSN: formData.isolasiSN || 0,
        isolasiTN: formData.isolasiTN || 0,
        isolasiRG: formData.isolasiRG || 0,
        isolasiSG: formData.isolasiSG || 0,
        isolasiTG: formData.isolasiTG || 0,
        jenisPenyalurPetir: formData.jenisPenyalurPetir || 'Konvensional',
        lokasiPemasangan: formData.lokasiPemasangan || '',
        bentukPenerima: formData.bentukPenerima || 'Runcing',
        jumlahAirTerminal: formData.jumlahAirTerminal || 1,
        tinggiTiangPenangkal: formData.tinggiTiangPenerima || 0,
        tinggiBangunan: formData.tinggiBangunan || 0,
        jenisDownConductor: formData.jenisDownConductor || '',
        ukuranDownConductor: formData.ukuranDownConductor || 50,
        visualFaults: visualFaults.length > 0 ? visualFaults.join('\n') : 'Tidak ada temuan visual bermasalah.',
        overallSafetyStatus: calculations?.overallSafetyStatus || 'AMAN'
      };

      let systemPrompt = config.aiPrompts.systemPrompt;
      let populatedContext = rawContext;
      const sectionPrompts: Record<string, string> = {};

      // Replace placeholders
      Object.keys(values).forEach(key => {
        const regex = new RegExp(`{${key}}`, 'g');
        populatedContext = populatedContext.replace(regex, String(values[key]));
        systemPrompt = systemPrompt.replace(regex, String(values[key]));
        
        Object.keys(config.aiPrompts.sectionPrompts).forEach(secKey => {
          const rawSecPrompt = (config.aiPrompts.sectionPrompts as any)[secKey];
          sectionPrompts[secKey] = (sectionPrompts[secKey] || rawSecPrompt).replace(regex, String(values[key]));
        });
      });

      // Panggil API Vercel Serverless
      const response = await fetch(`${apiBase}/api/report?action=narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: `${systemPrompt}\n\nKonteks Data:\n${populatedContext}`,
          prompts: sectionPrompts
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} dari Narrative Engine`);
      }

      const resData = await response.json();
      setAiNarrative(resData.data);
      setCurrentStep(7);
    } catch (err: any) {
      alert(`Gagal membuat narasi AI: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveNarrative = (sectionKey: string, text: string) => {
    setAiNarrative((prev: any) => ({ ...prev, [sectionKey]: text }));
  };

  const skipToManualNarrative = () => {
    const safety = calculations?.overallSafetyStatus || 'AMAN';
    const company = formData.companyName || 'Perusahaan';
    const equipLabel = config?.meta?.name || typeCode || 'Instalasi K3';
    setAiNarrative({
      executiveSummary: `Pemeriksaan dan pengujian berkala K3 dilakukan pada tanggal ${formData.inspectionDate} untuk ${equipLabel} ${company} yang berlokasi di ${formData.companyAddress || '-'}.`,
      findingsNarrative: `Berdasarkan pemeriksaan visual secara detail, secara umum kondisi fisik peralatan terpasang dalam kondisi layak, namun ada beberapa temuan minor yang dicatat untuk perbaikan lebih lanjut.`,
      testResultsNarrative: `Hasil pengujian teknis lapangan menunjukkan bahwa semua parameter yang diukur berada dalam batas aman yang diperbolehkan undang-undang dengan status safety: ${safety}.`,
      recommendations: `1. Lakukan perawatan kebersihan secara berkala.\n2. Lakukan pengecekan rutin terminal/komponen dan pengencangan baut.\n3. Pertahankan sistem pengaman sesuai regulasi K3 yang berlaku.`,
      conclusion: `${equipLabel} pada ${company} dinyatakan MEMENUHI persyaratan keselamatan dan kesehatan kerja (K3) serta LAYAK untuk dioperasikan.`
    });
    setCurrentStep(7);
  };

  // Submit Final Generation
  const handleGenerateFinalReport = async () => {
    setIsGenerating(true);
    setGenStatus('Meminta nomor laporan antrean...');
    
    try {
      const apiBase = getApiBaseUrl();

      // 1. Validasi Nomor Laporan Manual
      const currentReportNum = reportNum;
      if (!currentReportNum) {
        throw new Error('Nomor Laporan wajib diisi secara manual pada tahap Data Umum.');
      }

      // 2. Rakit Payload Laporan Lengkap
      setGenStatus('Mempersiapkan data dan kompresi foto...');
      
      const orderedPhotos = getOrderedDocPhotos(selectedPhotos);
      const compressedPhotos: any[] = [];
      for (let i = 0; i < orderedPhotos.length; i++) {
        const p = orderedPhotos[i];
        try {
          const rawSrc = await resolveDocPhotoDataUrl(p, apiBase);
          const compressedUrl = rawSrc ? await ImageCompressor.compress(rawSrc, 1200, 0.75) : '';
          if (compressedUrl) {
            compressedPhotos.push({
              sourceId: p.id,
              dataUrl: compressedUrl,
              caption: p.caption || p.fileName || `Foto Dokumentasi #${i + 1}`,
              category: 'Dokumentasi Lapangan',
              orderIndex: i,
              isCompressed: true
            });
          }
        } catch {
          // Lewati foto rusak agar ekspor tetap berjalan
        }
      }
      const jointItem = getJointDocPhoto(selectedPhotos);
      let jointPhotoDataUrl = '';
      if (jointItem) {
        try {
          const jointRawSrc = await resolveDocPhotoDataUrl(jointItem, apiBase);
          jointPhotoDataUrl = jointRawSrc ? await ImageCompressor.compress(jointRawSrc, 1200, 0.82) : '';
        } catch {
          // ignore
        }
      }

      // Bangun struktur data checklist
      const components: any[] = [];
      const continuity: any[] = [];
      if (config) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let mainCatIdx = 0;
        config.checklists.categories.forEach((cat) => {
          if (cat.categoryId === 'hubungan_antar_bagian') {
            cat.components.forEach(comp => {
              const items = comp.items.map((item, itemIdx) => ({
                itemId: item.itemId,
                no: itemIdx + 1,
                description: item.description,
                standard: item.standard,
                result: checklistResponses[item.itemId] || 'BAIK',
                remarks: checklistRemarks[item.itemId] || ''
              }));
              continuity.push(...items);
            });
          } else {
            const catLetter = alphabet[mainCatIdx] || String(mainCatIdx + 1);
            mainCatIdx++;
            cat.components.forEach(comp => {
              const items = comp.items.map((item, itemIdx) => ({
                itemId: item.itemId,
                no: itemIdx + 1,
                description: item.description,
                standard: item.standard,
                result: checklistResponses[item.itemId] || 'BAIK',
                remarks: checklistRemarks[item.itemId] || ''
              }));
              components.push({
                componentId: comp.componentId,
                componentName: comp.componentName,
                category: cat.categoryName,
                categoryNo: catLetter,
                items
              });
            });
          }
        });
      }

      const groundingStr = String(formData.tahananPembumian || '0');
      const groundingPoints = groundingStr.split(',').map((val, idx) => ({
        no: idx + 1,
        value: val.trim()
      }));

      const reportPayload = {
        inspectionId: selectedInspection.id,
        reportNumber: currentReportNum,
        inspectionTypeCode: typeCode,
        configVersion: '1.0.0',
        status: 'generating',
        generalData: {
          companyName: formData.companyName,
          companyAddress: formData.companyAddress,
          inspectionDate: formData.inspectionDate,
          reportDate: formData.reportDate,
          inspectorCompany: 'PT. Aksara Riksa Perdana',
          inspectorName: localStorage.getItem('aksara_user_name') || '',
          inspectorCertNumber: ''
        },
        technicalData: {
          ...formData, // include all fields
          groundingPoints
        },
        checklistData: {
          configVersion: '1.0.0',
          components,
          continuity,
          overallResult: calculations?.overallSafetyStatus === 'AMAN' ? 'LAIK' : 'LAIK_BERSYARAT'
        },
        testingData: {
          measurements: config?.forms
            .filter(f => f.section === 'testing')
            .map(f => {
              const rawVal = String(formData[f.fieldId] || '').trim();
              const numVal = Number(rawVal.replace(',', '.'));
              return {
                measurementId: f.fieldId,
                parameter: f.label,
                value: !isNaN(numVal) && rawVal !== '' ? numVal : rawVal,
                unit: f.unit || '',
                result: 'MEMENUHI'
              };
            }) || [],
          instruments: [
            { name: 'Kyoritsu Leakage Clamp Meter', brand: 'Kyoritsu', model: '2433R' }
          ]
        },
        formulaResults: calculations,
        aiNarrative: {
          modelUsed: 'gemini-2.0-flash',
          generatedAt: new Date().toISOString(),
          promptVersion: '1.0.0',
          sections: aiNarrative
        },
        photoDocumentation: {
          photos: compressedPhotos,
          jointPhoto: jointPhotoDataUrl,
          ...buildPhotoSelectionMeta(selectedPhotos),
          compressionQuality: 75,
          maxDimension: 1200
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
        createdBy: localStorage.getItem('aksara_user_email') || 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 3. Simpan draf ke local IndexedDB
      let localId: number;
      if (reportId) {
        await db.reports.put({ ...reportPayload, id: reportId });
        localId = reportId;
      } else {
        localId = await db.reports.add(reportPayload);
      }

      // 4. Kirim ke Serverless Generator
      setGenStatus('Mengirim ke Word Generator Server...');
      
      const genResponse = await fetch(`${apiBase}/api/report?action=generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: localId, reportData: reportPayload })
      });

      const genData = await genResponse.json().catch(() => ({}));
      if (!genResponse.ok || !genData.success) {
        throw new Error(genData.error || `Kesalahan server saat membuat dokumen (HTTP ${genResponse.status}).`);
      }

      const targetDriveId = genData.pdfDriveFileId || genData.outputDriveFileId || '';
      if (targetDriveId) {
        setGenLink(`https://drive.google.com/file/d/${targetDriveId}/view`);
      }
      setGenStatus('Dokumen laporan selesai dibuat dan tersimpan di Google Drive.');

      await db.reports.update(localId, {
        cloudId: genData.cloudId || reportPayload.inspectionId,
        status: 'completed',
        docxDriveFileId: genData.outputDriveFileId || '',
        pdfDriveFileId: genData.pdfDriveFileId || '',
        driveFileId: targetDriveId,
      });

    } catch (err: any) {
      alert(`Gagal generate dokumen: ${err.message}`);
      setGenStatus(`Gagal: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const genericPreviewData = useMemo<ReportPreviewData>(() => {
    const checklistSections: any[] = [];
    config?.checklists.categories.forEach((cat) => {
      const items: any[] = [];
      let no = 1;
      cat.components.forEach((comp) => {
        comp.items.forEach((it) => {
          items.push({
            no: no++,
            obyek: it.description,
            description: it.description,
            hasil: checklistResponses[it.itemId] || 'BAIK',
            result: checklistResponses[it.itemId] || 'BAIK',
            nilaiRujukan: it.standard || '-',
            standard: it.standard || '-',
            remarks: checklistRemarks[it.itemId] || '',
          });
        });
      });
      checklistSections.push({
        sectionTitle: cat.categoryName,
        categoryName: cat.categoryName,
        items,
      });
    });

    return {
      inspectionTypeCode: typeCode || 'K3',
      reportNumber: reportNum || '',
      generalData: {
        companyName: formData.companyName || '',
        companyAddress: formData.companyAddress || '',
        inspectionDate: formData.inspectionDate || '',
        reportDate: formData.reportDate || '',
        inspectorCompany: 'PT. AKSARA RIKSA PERDANA',
        inspectorName: '',
        inspectorField: 'Ahli Keselamatan dan Kesehatan Kerja',
        inspectorCertNumber: '',
      },
      technicalData: { ...formData },
      checklistSections,
      calculations,
      narratives: aiNarrative || {},
      gridPhotos: getOrderedDocPhotos(selectedPhotos).map((p) => ({
        id: p.id,
        caption: p.caption || p.fileName || '',
        dataUrl: p.dataUrl,
        driveFileId: p.driveFileId,
      })),
      jointPhoto: (() => {
        const j = getJointDocPhoto(selectedPhotos);
        return j
          ? {
              id: j.id,
              caption: j.caption || j.fileName || 'Foto Bersama Pihak Perusahaan',
              dataUrl: j.dataUrl,
              driveFileId: j.driveFileId,
            }
          : null;
      })(),
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
    typeCode,
    reportNum,
    formData,
    config,
    checklistResponses,
    checklistRemarks,
    calculations,
    aiNarrative,
    selectedPhotos,
    bapAttachments,
    extraAttachments,
  ]);

  if (typeCode === 'IPP' && selectedInspection && currentStep >= 2) {
    return (
      <IppReportWizard
        key={`IPP_${selectedInspection?.id || 'none'}_${reportId || 'new'}`}
        selectedInspection={selectedInspection}
        reportId={reportId}
        initialReportData={loadedReportData}
        onChangeSource={() => setCurrentStep(1)}
        onClose={onClose}
      />
    );
  }

  if (typeCode === 'IL' && selectedInspection && currentStep >= 2) {
    return (
      <IlReportWizard
        key={`IL_${selectedInspection?.id || 'none'}_${reportId || 'new'}`}
        selectedInspection={selectedInspection}
        reportId={reportId}
        initialReportData={loadedReportData}
        onChangeSource={() => setCurrentStep(1)}
        onClose={onClose}
      />
    );
  }

  const genericHeaderNode = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 font-bold text-xs">
          ❌ Batal
        </button>
        <span className="h-4 w-[1px] bg-gray-200" />
        <span className="text-xs font-bold text-gray-700 truncate">
          Step {currentStep} / 9:{' '}
          {currentStep === 2
            ? 'Data Umum'
            : currentStep === 3
            ? 'Data Teknis'
            : currentStep === 4
            ? 'Visual Checklist'
            : currentStep === 5
            ? 'Data Pengujian'
            : currentStep === 6
            ? 'Hasil Formula'
            : currentStep === 7
            ? 'AI Narrative'
            : currentStep === 8
            ? 'Foto & Lampiran'
            : 'Review & Generate'}
        </span>
      </div>
    </div>
  );

  const genericFooterNode = !isGenerating && !genLink ? (
    <div className="flex justify-between gap-2">
      <button
        onClick={() => setCurrentStep((prev) => prev - 1)}
        className="text-xs font-bold text-gray-600 border border-gray-200 bg-white px-4 py-2 rounded-xl hover:bg-gray-50"
      >
        ← Kembali
      </button>
      {currentStep === 5 ? (
        <button
          onClick={handleProceedToCalculations}
          className="text-xs font-bold text-white bg-emerald-600 px-5 py-2 rounded-xl hover:bg-emerald-700"
        >
          Uji &amp; Hitung K3 →
        </button>
      ) : currentStep === 6 ? (
        <div className="flex gap-2">
          <button
            onClick={skipToManualNarrative}
            className="text-xs font-bold text-gray-700 border border-gray-200 bg-white px-3 py-2 rounded-xl"
          >
            Manual
          </button>
          <button
            onClick={generateNarrative}
            className="text-xs font-bold text-white bg-emerald-600 px-4 py-2 rounded-xl"
          >
            AI Narasi →
          </button>
        </div>
      ) : currentStep < 9 ? (
        <button
          onClick={() => setCurrentStep((prev) => prev + 1)}
          className="text-xs font-bold text-white bg-emerald-600 px-5 py-2 rounded-xl hover:bg-emerald-700"
        >
          Lanjutkan →
        </button>
      ) : null}
    </div>
  ) : null;

  if (currentStep === 1) {
    return (
      <div className="bg-white rounded-2xl border border-gray-150 shadow-sm max-w-4xl mx-auto overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-black text-sm">
              ❌ Batal
            </button>
            <span className="h-4 w-[1px] bg-gray-200" />
            <span className="text-xs font-bold text-gray-500">Pilih Sesi Inspeksi</span>
          </div>
        </div>
        <div className="p-6 min-h-[360px] max-h-[75vh] overflow-y-auto space-y-4">
          <h3 className="text-sm font-black text-gray-900">1. Pilih Sumber Inspeksi (Synced)</h3>
          <p className="text-xs text-gray-500 font-medium">
            Laporan akan dibuat dengan mengambil data dasar dari riwayat inspeksi lapangan yang sudah tersinkronisasi di bawah ini.
          </p>
          <div className="space-y-2.5">
            {inspectionsList.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Belum ada riwayat inspeksi yang tersimpan. Lakukan inspeksi lapangan atau tarik data dari Google Drive di menu Sinkronisasi terlebih dahulu.
              </p>
            ) : (
              inspectionsList.map((insp) => {
                const parsedDate = insp.createdAt ? new Date(insp.createdAt) : null;
                const dateLabel =
                  parsedDate && !isNaN(parsedDate.getTime())
                    ? parsedDate.toLocaleDateString('id-ID')
                    : insp.unitData?.tanggal_inspeksi || '-';
                return (
                  <button
                    key={insp.id}
                    type="button"
                    onClick={() => handleSelectInspection(insp)}
                    className="w-full text-left border border-gray-200 p-4 rounded-xl hover:border-emerald-500 hover:bg-emerald-50/10 flex justify-between items-center transition-all"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-xs font-bold text-gray-800 truncate">{insp.clientName}</p>
                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5 truncate">
                        Tipe: {insp.objectType} | {dateLabel}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 shrink-0">Pilih →</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ReportWorkspaceLayout
      previewData={genericPreviewData}
      stickyHeader={genericHeaderNode}
      bottomNav={genericFooterNode}
    >
      {errors.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-xs text-rose-700 font-semibold space-y-1">
          <p className="font-bold">Perbaiki kesalahan berikut sebelum melanjutkan:</p>
          {errors.map((e, i) => (
            <p key={i}>• {e}</p>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-4">

        {/* STEP 2: DATA UMUM */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-black text-gray-900">2. Review Data Umum</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nama Perusahaan Klien *</label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={e => handleInputChange('companyName', e.target.value)}
                  className="w-full text-xs border border-gray-200 p-2.5 rounded-lg focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Alamat Perusahaan Klien</label>
                <input
                  type="text"
                  value={formData.companyAddress}
                  onChange={e => handleInputChange('companyAddress', e.target.value)}
                  className="w-full text-xs border border-gray-200 p-2.5 rounded-lg focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="w-full min-w-0">
                <label className="block text-xs font-bold text-gray-700 mb-1">Tanggal Inspeksi *</label>
                <input
                  type="date"
                  value={formData.inspectionDate}
                  onChange={e => handleInputChange('inspectionDate', e.target.value)}
                  style={{ WebkitAppearance: 'none', appearance: 'none', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
                  className="block w-full min-w-0 max-w-full box-border appearance-none text-xs text-left border border-gray-200 p-2.5 rounded-lg focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="w-full min-w-0">
                <label className="block text-xs font-bold text-gray-700 mb-1">Tanggal Laporan *</label>
                <input
                  type="date"
                  value={formData.reportDate}
                  onChange={e => handleInputChange('reportDate', e.target.value)}
                  style={{ WebkitAppearance: 'none', appearance: 'none', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
                  className="block w-full min-w-0 max-w-full box-border appearance-none text-xs text-left border border-gray-200 p-2.5 rounded-lg focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nomor Laporan *</label>
                <input
                  type="text"
                  placeholder="Contoh: 001/ARP/IPP/VII/2026"
                  value={reportNum}
                  onChange={e => setReportNum(e.target.value)}
                  className="w-full text-xs border border-gray-200 p-2.5 rounded-lg focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              
              {/* Render field custom general dari config */}
              {config?.forms.filter(f => f.section === 'general').map(f => (
                <div key={f.fieldId}>
                  <label className="block text-xs font-bold text-gray-700 mb-1">{f.label} {f.required && '*'}</label>
                  {f.type === 'select' ? (
                    <select
                      value={formData[f.fieldId] || f.defaultValue}
                      onChange={e => handleInputChange(f.fieldId, e.target.value)}
                      className="w-full text-xs border border-gray-200 p-2.5 rounded-lg"
                    >
                      {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={f.type}
                      value={formData[f.fieldId] ?? f.defaultValue ?? ''}
                      onChange={e => handleInputChange(f.fieldId, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full text-xs border border-gray-200 p-2.5 rounded-lg"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: DATA TEKNIS */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-black text-gray-900">3. Isi Data Teknis Spesifikasi Unit</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {config?.forms.filter(f => f.section === 'technical').map(f => (
                <div key={f.fieldId}>
                  <label className="block text-xs font-bold text-gray-700 mb-1">{f.label} {f.required && '*'}</label>
                  {f.type === 'select' ? (
                    <select
                      value={formData[f.fieldId] || f.defaultValue}
                      onChange={e => handleInputChange(f.fieldId, e.target.value)}
                      className="w-full text-xs border border-gray-200 p-2.5 rounded-lg"
                    >
                      {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={f.type}
                      value={formData[f.fieldId] ?? f.defaultValue ?? ''}
                      onChange={e => handleInputChange(f.fieldId, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full text-xs border border-gray-200 p-2.5 rounded-lg"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: VISUAL CHECKLIST BUILDER */}
        {currentStep === 4 && (
          <div className="space-y-5">
            <h3 className="text-sm font-black text-gray-900">4. Pemeriksaan Visual / Checklist K3</h3>
            {config?.checklists.categories.map(cat => (
              <div key={cat.categoryId} className="space-y-3 bg-gray-50/50 p-4 rounded-xl border border-gray-150">
                <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wide">{cat.categoryName}</h4>
                {cat.components.map(comp => (
                  <div key={comp.componentId} className="space-y-2">
                    {comp.items.map(item => (
                      <div key={item.itemId} className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-2.5 gap-2 bg-white p-3 rounded-lg border border-gray-100">
                        <div className="md:w-3/5">
                          <p className="text-xs font-bold text-gray-800">{item.description}</p>
                          {item.standard && <span className="text-[10px] text-gray-400 font-semibold">{item.standard}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {['BAIK', 'KURANG', 'TIDAK_ADA', 'NA'].map(res => (
                            <button
                              key={res}
                              onClick={() => handleChecklistResult(item.itemId, res as any)}
                              className={`text-[9.5px] font-black px-2.5 py-1.5 rounded-lg border transition-all ${
                                checklistResponses[item.itemId] === res
                                  ? res === 'BAIK' ? 'bg-emerald-600 border-emerald-600 text-white' :
                                    res === 'KURANG' ? 'bg-amber-500 border-amber-500 text-white' :
                                    res === 'TIDAK_ADA' ? 'bg-rose-500 border-rose-500 text-white' : 'bg-slate-500 border-slate-500 text-white'
                                  : 'bg-white text-gray-600 border-gray-250 hover:bg-gray-50'
                              }`}
                            >
                              {res === 'TIDAK_ADA' ? 'TIDAK ADA' : res}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Catatan..."
                          value={checklistRemarks[item.itemId] || ''}
                          onChange={e => handleChecklistRemark(item.itemId, e.target.value)}
                          className="text-[10px] border border-gray-200 p-1.5 rounded-lg md:w-1/4 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* STEP 5: DATA PENGUJIAN */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <h3 className="text-sm font-black text-gray-900">5. Input Hasil Pengukuran / Pengujian Alat</h3>
            <p className="text-xs text-gray-500 font-medium">Input parameter pengukuran riil dari instrumen uji lapangan.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {config?.forms.filter(f => f.section === 'testing').map(f => (
                <div key={f.fieldId} className="bg-white p-3.5 rounded-xl border border-gray-150 flex flex-col justify-between">
                  <div>
                    <label className="block text-xs font-bold text-gray-800 mb-1">{f.label} {f.required && '*'}</label>
                    <input
                      type="number"
                      value={formData[f.fieldId] ?? ''}
                      onChange={e => handleInputChange(f.fieldId, e.target.value)}
                      placeholder="0"
                      className="w-full text-xs border border-gray-200 p-2.5 rounded-lg focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 6: HASIL FORMULA */}
        {currentStep === 6 && calculations && (
          <div className="space-y-5">
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
              <div>
                <h4 className="text-xs font-black text-emerald-800">Determinasi Formula Engine Selesai</h4>
                <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Perhitungan aman & balance beban berhasil diuji secara lokal.</p>
              </div>
              <span className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-lg border ${
                calculations.overallSafetyStatus === 'AMAN' ? 'bg-emerald-600 text-white border-emerald-600' :
                calculations.overallSafetyStatus === 'PERLU_PERBAIKAN' ? 'bg-amber-500 text-white border-amber-500' :
                'bg-rose-600 text-white border-rose-600'
              }`}>
                Safety: {calculations.overallSafetyStatus}
              </span>
            </div>

            <div className="space-y-3">
              {calculations.calculations.map((c: any) => (
                <div key={c.formulaId} className="border border-gray-150 p-4 rounded-xl flex flex-col md:flex-row justify-between md:items-center gap-3">
                  <div>
                    <p className="text-xs font-bold text-gray-800">{c.formulaName}</p>
                    <p className="text-[10px] text-gray-400 font-bold mt-0.5">{c.description}</p>
                    <p className="text-[11px] font-mono text-emerald-700 bg-emerald-50/50 px-2 py-1 rounded border border-emerald-100/50 mt-2 inline-block">
                      {c.details}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-gray-900">{c.result} {c.unit}</p>
                    <span className={`text-[10px] font-bold ${c.pass ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {c.pass ? '✓ MEMENUHI' : '✗ TIDAK MEMENUHI'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 7: AI NARRATIVE REVIEW */}
        {currentStep === 7 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900">7. AI Narrative Editor</h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">Tinjau narasi teknis kelistrikan formal dari Gemini AI dan edit jika diperlukan.</p>
              </div>
              <button
                onClick={generateNarrative}
                disabled={aiLoading}
                className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100"
              >
                {aiLoading ? 'Menyusun...' : 'Generate Ulang'}
              </button>
            </div>

            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-gray-500 font-bold">Gemini AI sedang menulis analisis teknis formal...</p>
              </div>
            ) : aiNarrative ? (
              <div className="space-y-4">
                {Object.keys(aiNarrative).map((secKey) => (
                  <div key={secKey} className="space-y-2 border border-gray-150 p-4 rounded-xl">
                    <label className="block text-xs font-bold text-gray-700 capitalize">
                      {secKey.replace(/([A-Z])/g, ' $1')}
                    </label>
                    <textarea
                      value={aiNarrative[secKey] || ''}
                      onChange={e => handleSaveNarrative(secKey, e.target.value)}
                      className="w-full text-xs font-medium text-gray-700 border border-gray-200 p-2.5 rounded-lg focus:ring-1 focus:ring-emerald-500 min-h-[120px] focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 p-6 space-y-3">
                <p className="text-xs font-bold text-gray-500">Belum ada narasi untuk bagian Kesimpulan & Rekomendasi.</p>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={generateNarrative}
                    className="bg-emerald-600 text-white font-bold text-xs px-4 py-2.5 rounded-lg hover:bg-emerald-700 active:scale-95 transition-all"
                  >
                    Generate Narasi via Gemini AI (Otomatis)
                  </button>
                  <button
                    onClick={skipToManualNarrative}
                    className="bg-white border border-gray-300 text-gray-700 font-bold text-xs px-4 py-2.5 rounded-lg hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    Tulis Manual (Tanpa AI)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 8: PHOTO DOCUMENTATION */}
        {currentStep === 8 && (
          <div className="space-y-4">
            <DocumentationPhotoPicker
              photos={selectedPhotos}
              onChange={setSelectedPhotos}
              apiBase={getApiBaseUrl()}
            />

            <div className="space-y-3 pt-2">
              <AttachmentSectionCard
                title="Lampiran BAP (Berita Acara Pemeriksaan)"
                badgeText="Sebelum Halaman SKP"
                subtitle="Unggah scan/foto/PDF Berita Acara Pemeriksaan setelah riksa uji selesai. Otomatis disisipkan sebelum halaman SKP PJK3 & SKP Ahli."
                emptyText="Belum ada lampiran BAP (Berita Acara Pemeriksaan)."
                buttonLabel="+ Unggah BAP (PDF / Foto)"
                accent="indigo"
                items={bapAttachments}
                onChange={setBapAttachments}
              />

              <div className="px-3 py-2 rounded-xl bg-gray-50 border border-dashed border-gray-300 text-[11px] font-semibold text-gray-600 text-center">
                📄 Halaman SKP PJK3 Perusahaan &amp; SKP Ahli K3 disisipkan otomatis di sini
              </div>

              <AttachmentSectionCard
                title="Lampiran Tambahan Akhir (PDF / Gambar)"
                badgeText="Setelah Halaman SKP"
                subtitle="Sertifikat kalibrasi, surat tugas, denah, atau dokumen pendukung lain di halaman paling akhir."
                emptyText="Belum ada lampiran tambahan akhir."
                buttonLabel="+ Tambah Lampiran (PDF / Foto)"
                accent="emerald"
                items={extraAttachments}
                onChange={setExtraAttachments}
              />
            </div>
          </div>
        )}

        {/* STEP 9: REVIEW & GENERATE */}
        {currentStep === 9 && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-5 rounded-2xl border border-gray-150 space-y-3">
              <h4 className="text-sm font-black text-gray-900">Tinjau Detail Sebelum Generate</h4>
              <div className="text-xs space-y-1.5 font-medium text-gray-600">
                <p>⚡ <span className="font-bold text-gray-800">Klien:</span> {formData.companyName}</p>
                <p>⚡ <span className="font-bold text-gray-800">Tanggal:</span> {formData.inspectionDate}</p>
                <p>⚡ <span className="font-bold text-gray-800">Alamat:</span> {formData.companyAddress}</p>
                <p>⚡ <span className="font-bold text-gray-800">Nomor Laporan:</span> {reportNum || 'Dibuat otomatis oleh antrean server'}</p>
                <p>⚡ <span className="font-bold text-gray-800">Status Proteksi:</span> {calculations?.overallSafetyStatus}</p>
                <p>⚡ <span className="font-bold text-gray-800">Foto Terpilih:</span> {getOrderedDocPhotos(selectedPhotos).length} Foto Dokumentasi • {getJointDocPhoto(selectedPhotos) ? '1' : '0'} Foto Bersama</p>
                <p>⚡ <span className="font-bold text-gray-800">Lampiran BAP (Sebelum SKP):</span> {bapAttachments.length} halaman</p>
                <p>⚡ <span className="font-bold text-gray-800">Lampiran Tambahan Akhir:</span> {extraAttachments.length} halaman</p>
              </div>
            </div>

            {isGenerating ? (
              <div className="flex flex-col items-center justify-center bg-gray-50/50 border border-gray-150 p-6 rounded-2xl space-y-4">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-center space-y-1">
                  <p className="text-xs font-black text-gray-800">Sedang Membuat Dokumen Laporan K3...</p>
                  <p className="text-[10px] text-gray-400 font-bold">{genStatus}</p>
                </div>
              </div>
            ) : genLink ? (
              <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl text-center space-y-4">
                <div className="text-4xl">🎉</div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-emerald-800">Laporan Berhasil Dibuat!</h4>
                  <p className="text-[11px] text-emerald-600 font-medium">Laporan sudah di-generate dalam format Word `.docx` dan diupload ke Google Drive.</p>
                </div>
                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                  <a
                    href={genLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-500/10"
                  >
                    Buka Laporan di Google Docs ↗
                  </a>
                  <button
                    onClick={onClose}
                    className="border border-emerald-200 text-emerald-700 font-bold text-xs py-2.5 rounded-xl hover:bg-emerald-100/50 transition-all"
                  >
                    Kembali Ke Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGenerateFinalReport}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-sm py-4 rounded-xl hover:shadow-lg active:scale-[0.99] transition-all shadow-md shadow-emerald-600/10"
              >
                Mulai Generate Laporan Akhir (.docx)
              </button>
            )}
          </div>
        )}
      </div>
    </ReportWorkspaceLayout>
  );
}
