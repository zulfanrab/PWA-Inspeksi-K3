// src/engines/FormulaEngine.ts
import { getConfigByCode } from '../report-configs/registry';

export interface FormulaCalculation {
  formulaId: string;
  formulaName: string;
  inputs: Record<string, number>;
  formula: string;
  result: number;
  unit: string;
  threshold: number;
  thresholdType: 'MAX' | 'MIN';
  pass: boolean;
  details?: string;
}

export interface FormulaResultSection {
  engineVersion: string;
  calculatedAt: string;
  calculations: FormulaCalculation[];
  overallSafetyStatus: 'AMAN' | 'TIDAK_AMAN' | 'PERLU_PERBAIKAN';
  summary: Record<string, any>;
}

export const FormulaEngine = {
  calculate: (inspectionTypeCode: string, inputs: Record<string, any>): FormulaResultSection => {
    const config = getConfigByCode(inspectionTypeCode);
    if (!config) {
      throw new Error(`[FormulaEngine] Konfigurasi untuk tipe "${inspectionTypeCode}" tidak ditemukan.`);
    }

    const calculations: FormulaCalculation[] = [];
    let hasFailure = false;

    // Lakukan perhitungan untuk semua rumus yang ada di config
    for (const formulaCfg of config.formulas) {
      // Dapatkan input yang relevan untuk rumus ini
      const formulaInputs: Record<string, number> = {};
      for (const fieldId of formulaCfg.inputFields) {
        formulaInputs[fieldId] = Number(inputs[fieldId] || 0);
      }

      // Jalankan calculate pada konfigurasi tipe (mengandung fungsi TS calculate)
      let calcResult = { result: 0, pass: true, details: '' };
      if ('calculate' in formulaCfg && typeof (formulaCfg as any).calculate === 'function') {
        calcResult = (formulaCfg as any).calculate(inputs);
      }

      if (!calcResult.pass) {
        hasFailure = true;
      }

      calculations.push({
        formulaId: formulaCfg.formulaId,
        formulaName: formulaCfg.formulaName,
        inputs: formulaInputs,
        formula: formulaCfg.formula,
        result: calcResult.result,
        unit: formulaCfg.resultUnit,
        threshold: formulaCfg.threshold,
        thresholdType: formulaCfg.thresholdType,
        pass: calcResult.pass,
        details: calcResult.details
      });
    }

    // Tentukan safety status berdasarkan hasil perhitungan
    let overallSafetyStatus: 'AMAN' | 'TIDAK_AMAN' | 'PERLU_PERBAIKAN' = 'AMAN';
    if (hasFailure) {
      // Jika ada yang belum memenuhi standar (misal grounding > 5 Ohm atau unbalance > 20%)
      overallSafetyStatus = 'PERLU_PERBAIKAN';
      
      // Untuk kasus kritis, kita bisa tandai TIDAK_AMAN
      const isCriticalFail = calculations.some(c => 
        (c.formulaId === 'tahanan_pembumian' || c.formulaId === 'tahanan_pentanahan') && !c.pass
      );
      if (isCriticalFail) {
        overallSafetyStatus = 'TIDAK_AMAN';
      }
    }

    return {
      engineVersion: '1.0.0',
      calculatedAt: new Date().toISOString(),
      calculations,
      overallSafetyStatus,
      summary: {
        totalCalculations: calculations.length,
        passedCalculations: calculations.filter(c => c.pass).length,
        failedCalculations: calculations.filter(c => !c.pass).length
      }
    };
  }
};
