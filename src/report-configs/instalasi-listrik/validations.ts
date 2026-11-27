// src/report-configs/instalasi-listrik/validations.ts
import { ValidationRule } from '../types';

export const validations: ValidationRule[] = [
  {
    ruleId: 'grounding_max_5',
    fieldId: 'tahananPentanahan',
    type: 'range',
    params: { max: 5.0 },
    errorMessage: 'Tahanan Pentanahan melebihi batas SNI/PUIL 2011 (maksimum 5.0 Ω).',
    severity: 'error',
  },
  {
    ruleId: 'suhu_r_max_70',
    fieldId: 'suhuR',
    type: 'range',
    params: { max: 70 },
    errorMessage: 'Suhu penghantar Phasa R melebihi batas maksimum 70 °C.',
    severity: 'warning',
  },
  {
    ruleId: 'suhu_s_max_70',
    fieldId: 'suhuS',
    type: 'range',
    params: { max: 70 },
    errorMessage: 'Suhu penghantar Phasa S melebihi batas maksimum 70 °C.',
    severity: 'warning',
  },
  {
    ruleId: 'suhu_t_max_70',
    fieldId: 'suhuT',
    type: 'range',
    params: { max: 70 },
    errorMessage: 'Suhu penghantar Phasa T melebihi batas maksimum 70 °C.',
    severity: 'warning',
  },
];
