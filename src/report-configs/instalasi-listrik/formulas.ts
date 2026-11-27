// src/report-configs/instalasi-listrik/formulas.ts
import { FormulaConfig } from '../types';
import { parseGroundingResistanceList } from '../../utils/reportHelpers';

export interface FormulaConfigWithCalc extends FormulaConfig {
  calculate: (inputs: Record<string, any>) => {
    result: number;
    pass: boolean;
    details: string;
  };
}

export interface PuilKhaEntry {
  mm2: string;
  intiTunggal: { diTanah: number; diUdara: number };
  duaInti: { diTanah: number | null; diUdara: number | null };
  tigaEmpatInti: { diTanah: number | null; diUdara: number | null };
}

/**
 * Tabel 2.5 Daftar KHA Kabel Terus Menerus (A) — PUIL 2011 Hal. 524
 * Berlaku untuk NYY, NYBY, NYFGbY, NYRGbY, NYC, NYCWY, NYSY, NYCEY, NYSEY, NYHSY,
 * NYKY, NYKBY, NYKFGbY, NYKRGbY.
 */
export const PUIL_2011_KHA_TABLE: PuilKhaEntry[] = [
  { mm2: '1.5', intiTunggal: { diTanah: 40, diUdara: 26 }, duaInti: { diTanah: 31, diUdara: 20 }, tigaEmpatInti: { diTanah: 26, diUdara: 18.5 } },
  { mm2: '2.5', intiTunggal: { diTanah: 54, diUdara: 35 }, duaInti: { diTanah: 41, diUdara: 27 }, tigaEmpatInti: { diTanah: 34, diUdara: 25 } },
  { mm2: '4', intiTunggal: { diTanah: 70, diUdara: 46 }, duaInti: { diTanah: 54, diUdara: 37 }, tigaEmpatInti: { diTanah: 44, diUdara: 34 } },
  { mm2: '6', intiTunggal: { diTanah: 90, diUdara: 58 }, duaInti: { diTanah: 68, diUdara: 48 }, tigaEmpatInti: { diTanah: 56, diUdara: 43 } },
  { mm2: '10', intiTunggal: { diTanah: 122, diUdara: 79 }, duaInti: { diTanah: 92, diUdara: 66 }, tigaEmpatInti: { diTanah: 75, diUdara: 60 } },
  { mm2: '16', intiTunggal: { diTanah: 160, diUdara: 105 }, duaInti: { diTanah: 121, diUdara: 89 }, tigaEmpatInti: { diTanah: 98, diUdara: 80 } },
  { mm2: '25', intiTunggal: { diTanah: 206, diUdara: 140 }, duaInti: { diTanah: 153, diUdara: 118 }, tigaEmpatInti: { diTanah: 128, diUdara: 106 } },
  { mm2: '35', intiTunggal: { diTanah: 249, diUdara: 174 }, duaInti: { diTanah: 187, diUdara: 145 }, tigaEmpatInti: { diTanah: 157, diUdara: 131 } },
  { mm2: '50', intiTunggal: { diTanah: 296, diUdara: 212 }, duaInti: { diTanah: 222, diUdara: 176 }, tigaEmpatInti: { diTanah: 185, diUdara: 159 } },
  { mm2: '70', intiTunggal: { diTanah: 365, diUdara: 269 }, duaInti: { diTanah: 272, diUdara: 224 }, tigaEmpatInti: { diTanah: 228, diUdara: 202 } },
  { mm2: '95', intiTunggal: { diTanah: 438, diUdara: 331 }, duaInti: { diTanah: 328, diUdara: 271 }, tigaEmpatInti: { diTanah: 275, diUdara: 244 } },
  { mm2: '120', intiTunggal: { diTanah: 499, diUdara: 386 }, duaInti: { diTanah: 375, diUdara: 314 }, tigaEmpatInti: { diTanah: 313, diUdara: 282 } },
  { mm2: '150', intiTunggal: { diTanah: 561, diUdara: 442 }, duaInti: { diTanah: 419, diUdara: 361 }, tigaEmpatInti: { diTanah: 353, diUdara: 324 } },
  { mm2: '185', intiTunggal: { diTanah: 637, diUdara: 511 }, duaInti: { diTanah: 475, diUdara: 412 }, tigaEmpatInti: { diTanah: 399, diUdara: 371 } },
  { mm2: '240', intiTunggal: { diTanah: 743, diUdara: 612 }, duaInti: { diTanah: 550, diUdara: 484 }, tigaEmpatInti: { diTanah: 464, diUdara: 436 } },
  { mm2: '300', intiTunggal: { diTanah: 843, diUdara: 707 }, duaInti: { diTanah: 525, diUdara: 590 }, tigaEmpatInti: { diTanah: 524, diUdara: 481 } },
  { mm2: '400', intiTunggal: { diTanah: 986, diUdara: 859 }, duaInti: { diTanah: 605, diUdara: 710 }, tigaEmpatInti: { diTanah: 600, diUdara: 560 } },
  { mm2: '500', intiTunggal: { diTanah: 1125, diUdara: 1000 }, duaInti: { diTanah: null, diUdara: null }, tigaEmpatInti: { diTanah: null, diUdara: null } },
];

export function lookupPuilKha(
  luasMm2: string | number,
  jumlahInti: string = '3-4',
  instalasi: string = 'Di Udara'
): number | null {
  const normMm2 = String(luasMm2 || '').replace(',', '.').trim();
  const entry = PUIL_2011_KHA_TABLE.find((row) => row.mm2 === normMm2);
  if (!entry) return null;

  const isDiTanah = String(instalasi || '').toLowerCase().includes('tanah');
  const coreNorm = String(jumlahInti || '3-4').trim();

  if (coreNorm === '1') {
    return isDiTanah ? entry.intiTunggal.diTanah : entry.intiTunggal.diUdara;
  }
  if (coreNorm === '2') {
    return isDiTanah ? entry.duaInti.diTanah : entry.duaInti.diUdara;
  }
  return isDiTanah ? entry.tigaEmpatInti.diTanah : entry.tigaEmpatInti.diUdara;
}

function toNum(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  const cleaned = String(val ?? '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

function fmt(num: number, decimals = 2): string {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(num * factor) / factor;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals).replace(/\.?0+$/, '');
}

export interface IlAnalysisResult {
  // Arus nominal
  dayaTerpasangKva: string;
  teganganVolt: string;
  cosPhi: string;
  dayaAktifKw: string;
  dayaAktifWatt: string;
  inDenominatorExpr: string;
  inDenominatorVal: string;
  arusNominalNum: number;
  arusNominal: string;

  // KHA Penghantar
  khaHitungNum: number;
  khaHitung: string;
  jenisKabel: string;
  ukuranKabel: string;
  instalasiKabel: string;
  khaKabelNum: number;
  khaKabel: string;
  khaPass: boolean;
  khaConclusion: string;

  // Rating Proteksi Utama
  jenisProteksi: string;
  kapasitasProteksiNum: number;
  kapasitasProteksi: string;
  ratingCbHitungNum: number;
  ratingCbHitung: string;
  proteksiPass: boolean;
  proteksiConclusion: string;

  // Keseimbangan Beban RST
  arusRNum: number;
  arusSNum: number;
  arusTNum: number;
  arusR: string;
  arusS: string;
  arusT: string;
  arusTotal: string;
  arusRataRata: string;
  rasioA: string;
  rasioB: string;
  rasioC: string;
  devA: string;
  devB: string;
  devC: string;
  devTotal: string;
  unbalanceNum: number;
  unbalancePercent: string;
  unbalancePass: boolean;
  unbalanceConclusion: string;

  // Pentanahan & keseluruhan
  groundingMaxNum: number;
  groundingPass: boolean;
}

export function computeIlAnalysis(inputs: Record<string, any>): IlAnalysisResult {
  const rawKva =
    inputs.dayaTerpasangKva !== undefined && String(inputs.dayaTerpasangKva).trim() !== ''
      ? inputs.dayaTerpasangKva
      : inputs.sumberDayaListrik ?? inputs.dayaTerpasang ?? 0;
  const kva = toNum(rawKva, 0);

  const isSinglePhase = String(inputs.jumlahPhasa || '').toLowerCase().includes('1');
  const V = toNum(inputs.teganganVolt, isSinglePhase ? 220 : 380);
  const cosPhi = toNum(inputs.cosPhi, 0.8);

  const pKwNum = kva * cosPhi;
  const pWattNum = pKwNum * 1000;

  const denomExpr = isSinglePhase ? `${fmt(V)} × ${fmt(cosPhi)}` : `${fmt(V)} × ${fmt(cosPhi)} × √3`;
  const denomValNum = isSinglePhase ? V * cosPhi : V * cosPhi * Math.sqrt(3);
  const inNum = denomValNum > 0 ? pWattNum / denomValNum : 0;

  // 2. KHA Penghantar Utama (1.25 x In)
  const khaHitungNum = 1.25 * inNum;
  const lookupKha = lookupPuilKha(inputs.luasPenampangMm2 || '10', inputs.jumlahIntiKabel || '3-4', inputs.instalasiKabel || 'Di Udara');
  const khaKabelNum =
    inputs.khaKabel !== undefined && String(inputs.khaKabel).trim() !== ''
      ? toNum(inputs.khaKabel, lookupKha ?? 0)
      : lookupKha ?? 0;

  const khaHitungStr = khaHitungNum.toFixed(2);
  const khaKabelStr = fmt(khaKabelNum, 1);
  const khaPass = khaKabelNum >= khaHitungNum && khaKabelNum > 0;
  const khaConclusion =
    khaKabelNum <= 0
      ? 'Kapasitas Hantar Arus (KHA) Kabel terpasang belum diisi.'
      : khaPass
      ? `Kapasitas Hantar Arus (KHA) Kabel ${khaKabelStr} A > ${khaHitungStr} A Kapasitas Hantar Arus (KHA) hitung, Maka ACC`
      : `Kapasitas Hantar Arus (KHA) Kabel ${khaKabelStr} A < ${khaHitungStr} A Kapasitas Hantar Arus (KHA) hitung, Maka TIDAK ACC (KHA penghantar utama lebih kecil dari 125% In)`;

  // 3. Rating Proteksi Utama (1.15 x In)
  const jenisProteksi = String(inputs.jenisProteksi || inputs.jenisProteksiUtama || 'MCCB');
  const kapasitasProteksiNum = toNum(inputs.kapasitasProteksi ?? inputs.ratingProteksiUtama, 0);
  const ratingCbHitungNum = 1.15 * inNum;
  const ratingCbHitungStr = ratingCbHitungNum.toFixed(2);
  const kapasitasProteksiStr = fmt(kapasitasProteksiNum, 1);
  const proteksiPass = kapasitasProteksiNum >= ratingCbHitungNum && kapasitasProteksiNum > 0;
  const proteksiConclusion =
    kapasitasProteksiNum <= 0
      ? `Kapasitas ${jenisProteksi} terpasang belum diisi.`
      : proteksiPass
      ? `Kapasitas ${jenisProteksi} yang terpasang ${kapasitasProteksiStr} A > ${ratingCbHitungStr} A Perhitungan Rating Utama CB, Maka ACC`
      : `Kapasitas ${jenisProteksi} yang terpasang ${kapasitasProteksiStr} A < ${ratingCbHitungStr} A Perhitungan Rating Utama CB, Maka TIDAK ACC (Peringatan: kapasitas proteksi di bawah 115% In)`;

  // 4. Keseimbangan Beban RST
  const arusRNum = toNum(inputs.arusR ?? inputs.bebanR, 0);
  const arusSNum = toNum(inputs.arusS ?? inputs.bebanS, 0);
  const arusTNum = toNum(inputs.arusT ?? inputs.bebanT, 0);
  const arusTotalNum = arusRNum + arusSNum + arusTNum;
  const arusRataNum = arusTotalNum / 3;

  let rasioA = '0.000';
  let rasioB = '0.000';
  let rasioC = '0.000';
  let devA = '0.000';
  let devB = '0.000';
  let devC = '0.000';
  let devTotal = '0.000';
  let unbalanceNum = 0;

  if (arusRataNum > 0) {
    const a = arusRNum / arusRataNum;
    const b = arusSNum / arusRataNum;
    const c = arusTNum / arusRataNum;
    const da = Math.abs(a - 1);
    const db = Math.abs(b - 1);
    const dc = Math.abs(c - 1);
    const dTot = da + db + dc;
    unbalanceNum = (dTot / 3) * 100;

    rasioA = a.toFixed(3);
    rasioB = b.toFixed(3);
    rasioC = c.toFixed(3);
    devA = da.toFixed(3);
    devB = db.toFixed(3);
    devC = dc.toFixed(3);
    devTotal = dTot.toFixed(3);
  }

  const unbalanceStr = unbalanceNum.toFixed(2);
  const unbalancePass = unbalanceNum < 20;
  const unbalanceConclusion =
    arusRataNum === 0
      ? 'Berdasarkan hasil pengukuran beban phasa R, S, dan T = 0 A (I unbalance = 0 % < 20%), Maka ACC'
      : unbalancePass
      ? `Berdasarkan hasil perhitungan di atas I unbalance = ${unbalanceStr} % < 20% (Batas Maksimal Unbalance 20%), Maka ACC`
      : `Berdasarkan hasil perhitungan di atas I unbalance = ${unbalanceStr} % >= 20% (Batas Maksimal Unbalance 20%), Maka TIDAK ACC / Perlu penyeimbangan beban`;

  // Grounding check
  const gVals = parseGroundingResistanceList(inputs.tahananPentanahan);
  const groundingMaxNum = gVals.length > 0 ? Math.max(...gVals) : 0;
  const groundingPass = gVals.length === 0 ? true : groundingMaxNum <= 5.0;

  return {
    dayaTerpasangKva: fmt(kva, 2),
    teganganVolt: fmt(V, 0),
    cosPhi: fmt(cosPhi, 2),
    dayaAktifKw: fmt(pKwNum, 2),
    dayaAktifWatt: fmt(pWattNum, 0),
    inDenominatorExpr: denomExpr,
    inDenominatorVal: denomValNum.toFixed(2),
    arusNominalNum: Math.round(inNum * 100) / 100,
    arusNominal: inNum.toFixed(2),

    khaHitungNum: Math.round(khaHitungNum * 100) / 100,
    khaHitung: khaHitungStr,
    jenisKabel: String(inputs.jenisKabel || 'NYY'),
    ukuranKabel: String(inputs.ukuranKabel || '-'),
    instalasiKabel: String(inputs.instalasiKabel || 'Di Udara'),
    khaKabelNum,
    khaKabel: khaKabelStr,
    khaPass,
    khaConclusion,

    jenisProteksi,
    kapasitasProteksiNum,
    kapasitasProteksi: kapasitasProteksiStr,
    ratingCbHitungNum: Math.round(ratingCbHitungNum * 100) / 100,
    ratingCbHitung: ratingCbHitungStr,
    proteksiPass,
    proteksiConclusion,

    arusRNum,
    arusSNum,
    arusTNum,
    arusR: fmt(arusRNum, 2),
    arusS: fmt(arusSNum, 2),
    arusT: fmt(arusTNum, 2),
    arusTotal: fmt(arusTotalNum, 2),
    arusRataRata: arusRataNum.toFixed(2),
    rasioA,
    rasioB,
    rasioC,
    devA,
    devB,
    devC,
    devTotal,
    unbalanceNum: Math.round(unbalanceNum * 100) / 100,
    unbalancePercent: unbalanceStr,
    unbalancePass,
    unbalanceConclusion,

    groundingMaxNum,
    groundingPass,
  };
}

export const formulas: FormulaConfigWithCalc[] = [
  {
    formulaId: 'arus_nominal',
    formulaName: 'Arus Nominal (In)',
    description: 'Menghitung Arus Nominal berdasarkan Daya Terpasang, Tegangan, dan Cos Phi sesuai PUIL 2011',
    inputFields: ['dayaTerpasangKva', 'teganganVolt', 'cosPhi', 'jumlahPhasa'],
    formula: 'In = P(Watt) / (V * cos(phi) * sqrt(3)) [3 Phasa] atau P / (V * cos(phi)) [1 Phasa]',
    resultUnit: 'A',
    threshold: 0,
    thresholdType: 'MIN',
    standardRef: 'PUIL 2011',
    calculate: (inputs) => {
      const a = computeIlAnalysis(inputs);
      return {
        result: a.arusNominalNum,
        pass: a.arusNominalNum > 0,
        details: `P = ${a.dayaAktifWatt} W; In = ${a.dayaAktifWatt} / ${a.inDenominatorVal} = ${a.arusNominal} A`,
      };
    },
  },
  {
    formulaId: 'kha_kabel',
    formulaName: 'KHA Penghantar Utama (125% × In)',
    description: 'Membandingkan KHA kabel Tabel 2.5 PUIL 2011 dengan 1,25 × In',
    inputFields: ['dayaTerpasangKva', 'teganganVolt', 'cosPhi', 'khaKabel'],
    formula: 'KHA_kabel >= 1.25 * In',
    resultUnit: 'A',
    threshold: 0,
    thresholdType: 'MIN',
    standardRef: 'PUIL 2011 - 5.5.4.3 & Tabel 2.5 Hal. 524',
    calculate: (inputs) => {
      const a = computeIlAnalysis(inputs);
      return {
        result: a.khaHitungNum,
        pass: a.khaPass,
        details: a.khaConclusion,
      };
    },
  },
  {
    formulaId: 'rating_proteksi',
    formulaName: 'Rating Proteksi Utama (115% × In)',
    description: 'Memastikan kapasitas pengaman utama (MCCB/MCB/ACB/Fuse) >= 1,15 × In',
    inputFields: ['dayaTerpasangKva', 'teganganVolt', 'cosPhi', 'kapasitasProteksi'],
    formula: 'CB_terpasang >= 1.15 * In',
    resultUnit: 'A',
    threshold: 0,
    thresholdType: 'MIN',
    standardRef: 'PUIL 2011',
    calculate: (inputs) => {
      const a = computeIlAnalysis(inputs);
      return {
        result: a.ratingCbHitungNum,
        pass: a.proteksiPass,
        details: a.proteksiConclusion,
      };
    },
  },
  {
    formulaId: 'keseimbangan_beban',
    formulaName: 'Keseimbangan Beban Phasa (RST Unbalance)',
    description: 'Menghitung ketidakseimbangan arus phasa R-S-T dengan batas maksimal < 20%',
    inputFields: ['arusR', 'arusS', 'arusT'],
    formula: 'I_unbalance = (|a-1| + |b-1| + |c-1|) / 3 * 100% < 20%',
    resultUnit: '%',
    threshold: 20,
    thresholdType: 'MAX',
    standardRef: 'PUIL 2011 / Standar Distribusi Tenaga Listrik',
    calculate: (inputs) => {
      const a = computeIlAnalysis(inputs);
      return {
        result: a.unbalanceNum,
        pass: a.unbalancePass,
        details: a.unbalanceConclusion,
      };
    },
  },
];
