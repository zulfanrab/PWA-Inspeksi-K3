// src/report-configs/penyalur-petir/formulas.ts
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
    formulaId: 'tahanan_pembumian',
    formulaName: 'Tahanan Pembumian (Grounding)',
    description: 'Menilai apakah nilai tahanan grounding berada di bawah ambang batas standar K3',
    inputFields: ['tahananPembumian'],
    formula: 'R_grounding <= 5.0 Ohm',
    resultUnit: 'Ω',
    threshold: 5.0,
    thresholdType: 'MAX',
    standardRef: 'Permenaker No.02/1989 Pasal 54',
    calculate: (inputs) => {
      const R_str = String(inputs.tahananPembumian || '0');
      const R_values = R_str.split(',').map(v => Number(v.trim()) || 0);
      const R_max = Math.max(...R_values);
      const pass = R_max <= 5.0;
      
      return {
        result: R_max,
        pass,
        details: `Tahanan grounding terukur (Maks): ${R_max} Ω. Batas maksimum standar: 5.0 Ω. Status: ${pass ? 'MEMENUHI (ACC)' : 'TIDAK MEMENUHI (Belum ACC)'}`
      };
    }
  },
  {
    formulaId: 'dimensi_down_conductor',
    formulaName: 'Dimensi Penampang Down Conductor',
    description: 'Menilai apakah luas penampang penghantar memenuhi batas minimum 50 mm2',
    inputFields: ['ukuranDownConductor'],
    formula: 'Penampang >= 50 mm2',
    resultUnit: 'mm²',
    threshold: 50.0,
    thresholdType: 'MIN',
    standardRef: 'Permenaker No.02/1989',
    calculate: (inputs) => {
      const size = Number(inputs.ukuranDownConductor || 0);
      const pass = size >= 50.0;

      return {
        result: size,
        pass,
        details: `Luas penampang terukur: ${size} mm². Batas minimum standar: 50 mm². Status: ${pass ? 'MEMENUHI (ACC)' : 'TIDAK MEMENUHI (Belum ACC)'}`
      };
    }
  }
];
