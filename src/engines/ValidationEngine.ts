// src/engines/ValidationEngine.ts
import { getConfigByCode } from '../report-configs/registry';

export interface ValidationError {
  fieldId: string;
  errorMessage: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export const ValidationEngine = {
  validate: (inspectionTypeCode: string, inputs: Record<string, any>): ValidationResult => {
    const config = getConfigByCode(inspectionTypeCode);
    if (!config) {
      return { isValid: true, errors: [] };
    }

    const errors: ValidationError[] = [];

    // 1. Cek kelengkapan wajib (required fields dari form configs)
    for (const field of config.forms) {
      if (field.required) {
        const val = inputs[field.fieldId];
        if (val === undefined || val === null || String(val).trim() === '') {
          errors.push({
            fieldId: field.fieldId,
            errorMessage: `${field.label} wajib diisi.`,
            severity: 'error'
          });
        }
      }
    }

    // 2. Jalankan aturan validasi spesifik
    for (const rule of config.validations) {
      const valStr = inputs[rule.fieldId];
      if (valStr === undefined || valStr === null || String(valStr).trim() === '') {
        continue; // Skip jika kosong (biar ditangani mandatory required)
      }

      const val = Number(valStr);

      if (rule.type === 'range') {
        const min = rule.params.min !== undefined ? Number(rule.params.min) : -Infinity;
        const max = rule.params.max !== undefined ? Number(rule.params.max) : Infinity;

        if (isNaN(val) || val < min || val > max) {
          errors.push({
            fieldId: rule.fieldId,
            errorMessage: rule.errorMessage,
            severity: rule.severity
          });
        }
      }
    }

    const isValid = !errors.some(e => e.severity === 'error');

    return {
      isValid,
      errors
    };
  }
};
