// src/report-configs/instalasi-listrik/formulas.ts
import { FormulaConfig } from '../types';

export interface FormulaConfigWithCalc extends FormulaConfig {
  calculate: (inputs: Record<string, any>) => {
    result: number;
    pass: boolean;
    details: string;
  };
}

export const formulas: FormulaConfigWithCalc[] = [
  {
    formulaId: 'arus_nominal',
    formulaName: 'Arus Nominal (In)',
    description: 'Menghitung arus nominal berdasarkan daya terpasang (3 Phase)',
    inputFields: ['sumberDayaListrik', 'teganganKerja'],
    formula: 'In = Daya(VA) / (Tegangan(V) * cos(phi) * sqrt(3))',
    resultUnit: 'A',
    threshold: 0,
    thresholdType: 'MIN',
    standardRef: 'PUIL 2011',
    calculate: (inputs) => {
      const dayaKva = Number(inputs.sumberDayaListrik || 0);
      const tegangan = Number(inputs.teganganKerja || 380);
      const cosPhi = 0.8; // Standar industri
      const sqrt3 = 1.732;

      const dayaVa = dayaKva * 1000;
      let result = 0;
      if (tegangan > 0) {
        result = dayaVa / (tegangan * cosPhi * sqrt3);
      }

      return {
        result: Math.round(result * 100) / 100,
        pass: true,
        details: `In = ${dayaVa} VA / (${tegangan} V * ${cosPhi} * 1.732) = ${result.toFixed(2)} A`
      };
    }
  },
  {
    formulaId: 'kha_kabel',
    formulaName: 'KHA Penghantar Utama (KHA)',
    description: 'KHA minimum = 125% dari Arus Nominal',
    inputFields: ['sumberDayaListrik', 'teganganKerja'],
    formula: 'KHA = 1.25 * In',
    resultUnit: 'A',
    threshold: 0,
    thresholdType: 'MIN',
    standardRef: 'PUIL 2011 Pasal 5.5.1.1',
    calculate: (inputs) => {
      // Dapatkan In dulu
      const dayaKva = Number(inputs.sumberDayaListrik || 0);
      const tegangan = Number(inputs.teganganKerja || 380);
      const cosPhi = 0.8;
      const sqrt3 = 1.732;
      const In = (dayaKva * 1000) / (tegangan * cosPhi * sqrt3);
      
      const khaLimit = 1.25 * In;
      
      return {
        result: Math.round(khaLimit * 100) / 100,
        pass: true,
        details: `KHA Min = 1.25 * ${In.toFixed(2)} A = ${khaLimit.toFixed(2)} A`
      };
    }
  },
  {
    formulaId: 'rating_proteksi',
    formulaName: 'Evaluasi Rating Proteksi Utama',
    description: 'Memastikan rating CB terpasang >= 115% dari In',
    inputFields: ['sumberDayaListrik', 'teganganKerja', 'ratingProteksiUtama'],
    formula: 'CB_terpasang >= 1.15 * In',
    resultUnit: 'A',
    threshold: 0,
    thresholdType: 'MIN',
    standardRef: 'PUIL 2011',
    calculate: (inputs) => {
      const ratingCb = Number(inputs.ratingProteksiUtama || 0);
      const dayaKva = Number(inputs.sumberDayaListrik || 0);
      const tegangan = Number(inputs.teganganKerja || 380);
      const cosPhi = 0.8;
      const sqrt3 = 1.732;
      const In = (dayaKva * 1000) / (tegangan * cosPhi * sqrt3);
      const cbMin = 1.15 * In;

      const pass = ratingCb >= cbMin;

      return {
        result: Math.round(cbMin * 100) / 100,
        pass,
        details: `Kebutuhan CB Min (1.15 * In) = 1.15 * ${In.toFixed(2)} A = ${cbMin.toFixed(2)} A. Terpasang: ${ratingCb} A. Status: ${pass ? 'MEMENUHI (ACC)' : 'KURANG (Belum ACC)'}`
      };
    }
  },
  {
    formulaId: 'keseimbangan_beban',
    formulaName: 'Keseimbangan Beban (Phase Unbalance)',
    description: 'Mendeteksi persentase ketidakseimbangan beban arus antar phasa (R-S-T) max 20%',
    inputFields: ['bebanR', 'bebanS', 'bebanT'],
    formula: 'I_unbalance = (|a-1| + |b-1| + |c-1|)/3 * 100% dimana a,b,c = I_phasa / I_rata-rata',
    resultUnit: '%',
    threshold: 20,
    thresholdType: 'MAX',
    standardRef: 'IEEE Std 141 / PUIL 2011',
    calculate: (inputs) => {
      const R = Number(inputs.bebanR || 0);
      const S = Number(inputs.bebanS || 0);
      const T = Number(inputs.bebanT || 0);

      // KOREKSI BUG MATHEMATICAL PRECEDENCE:
      // (R + S + T) / 3, bukan R + S + T / 3
      const avg = (R + S + T) / 3;
      
      if (avg === 0) {
        return {
          result: 0,
          pass: true,
          details: 'Rata-rata beban 0 A. Sistem Seimbang.'
        };
      }

      const a = R / avg;
      const b = S / avg;
      const c = T / avg;

      const unbalance = ((Math.abs(a - 1) + Math.abs(b - 1) + Math.abs(c - 1)) / 3) * 100;
      const pass = unbalance <= 20;

      return {
        result: Math.round(unbalance * 100) / 100,
        pass,
        details: `I Rata-rata = (${R} + ${S} + ${T}) / 3 = ${avg.toFixed(2)} A. Unbalance = (${Math.abs(a - 1).toFixed(3)} + ${Math.abs(b - 1).toFixed(3)} + ${Math.abs(c - 1).toFixed(3)}) / 3 = ${unbalance.toFixed(2)}%. Status: ${pass ? 'ACC (<= 20%)' : 'Belum ACC (> 20%)'}`
      };
    }
  }
];
