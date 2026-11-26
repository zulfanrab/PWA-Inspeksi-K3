// src/report-configs/penyalur-petir/formulas.ts
import { FormulaConfig } from '../types';

export interface FormulaConfigWithCalc extends FormulaConfig {
  calculate: (inputs: Record<string, any>) => {
    result: number;
    pass: boolean;
    details: string;
  };
}

export function calculateCrossSectionFromSigmat(diameterMm: number): number {
  if (!diameterMm || diameterMm <= 0 || isNaN(diameterMm)) return 0;
  return Number((0.25 * 3.14 * diameterMm * diameterMm).toFixed(2));
}

export const formulas: FormulaConfigWithCalc[] = [
  {
    formulaId: 'tahanan_pembumian',
    formulaName: 'Tahanan Pembumian (Grounding)',
    description: 'Menilai apakah nilai tahanan pembumian di seluruh titik berada <= 5.0 Ω',
    inputFields: ['tahananPembumian'],
    formula: 'R_grounding <= 5.0 Ohm',
    resultUnit: 'Ω',
    threshold: 5.0,
    thresholdType: 'MAX',
    standardRef: 'Permenaker No.02/1989 Pasal 54',
    calculate: (inputs) => {
      const R_str = String(inputs.tahananPembumian || '0');
      const R_values = R_str.split(',')
        .map((v) => Number(v.trim().replace(',', '.')))
        .filter((v) => !isNaN(v));
      const R_max = R_values.length > 0 ? Math.max(...R_values) : 0;
      const pass = R_max <= 5.0;

      return {
        result: R_max,
        pass,
        details: `Tahanan pembumian terukur (Maks): ${R_max} Ω. Batas maksimum standar: 5.0 Ω (Permenaker No.02/1989 Pasal 54). Status: ${pass ? 'MEMENUHI' : 'TIDAK MEMENUHI'}`,
      };
    },
  },
  {
    formulaId: 'dimensi_down_conductor',
    formulaName: 'Luas Penampang Penghantar Penurunan (Sigmat)',
    description: 'Menghitung A = 1/4 × 3.14 × d² dan menilai apakah memenuhi batas minimum 50 mm²',
    inputFields: ['hasilUkurSigmat', 'luasPenampangHitung'],
    formula: 'A = 0.25 * 3.14 * d^2 >= 50 mm2',
    resultUnit: 'mm²',
    threshold: 50.0,
    thresholdType: 'MIN',
    standardRef: 'Permenaker No.02/1989',
    calculate: (inputs) => {
      const manualArea = Number(inputs.luasPenampangHitung || 0);
      const sigmatD = Number(inputs.hasilUkurSigmat || 0);
      const size = manualArea > 0 ? manualArea : calculateCrossSectionFromSigmat(sigmatD);
      const pass = size >= 50.0;

      return {
        result: size,
        pass,
        details: `Luas penampang penghantar: ${size} mm²${sigmatD > 0 ? ` (diameter sigmat ${sigmatD} mm)` : ''}. Batas minimum standar: 50 mm². Status: ${pass ? 'MEMENUHI' : 'TIDAK MEMENUHI'}`,
      };
    },
  },
];
