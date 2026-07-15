// src/report-configs/instalasi-listrik/validations.ts
import { ValidationRule } from '../types';

export const validations: ValidationRule[] = [
  {
    ruleId: 'tahanan_isolasi_min',
    fieldId: 'isolasiRN',
    type: 'range',
    params: { min: 1.0 }, // PUIL 2011 requires min 1.0 MΩ for 500V systems
    errorMessage: 'Tahanan Isolasi R-N terlalu rendah. Standar minimum adalah 1.0 MΩ.',
    severity: 'error'
  },
  {
    ruleId: 'tahanan_isolasi_sn_min',
    fieldId: 'isolasiSN',
    type: 'range',
    params: { min: 1.0 },
    errorMessage: 'Tahanan Isolasi S-N terlalu rendah. Standar minimum adalah 1.0 MΩ.',
    severity: 'error'
  },
  {
    ruleId: 'tahanan_isolasi_tn_min',
    fieldId: 'isolasiTN',
    type: 'range',
    params: { min: 1.0 },
    errorMessage: 'Tahanan Isolasi T-N terlalu rendah. Standar minimum adalah 1.0 MΩ.',
    severity: 'error'
  },
  {
    ruleId: 'tahanan_isolasi_rg_min',
    fieldId: 'isolasiRG',
    type: 'range',
    params: { min: 1.0 },
    errorMessage: 'Tahanan Isolasi R-G terlalu rendah. Standar minimum adalah 1.0 MΩ.',
    severity: 'error'
  },
  {
    ruleId: 'tahanan_isolasi_sg_min',
    fieldId: 'isolasiSG',
    type: 'range',
    params: { min: 1.0 },
    errorMessage: 'Tahanan Isolasi S-G terlalu rendah. Standar minimum adalah 1.0 MΩ.',
    severity: 'error'
  },
  {
    ruleId: 'tahanan_isolasi_tg_min',
    fieldId: 'isolasiTG',
    type: 'range',
    params: { min: 1.0 },
    errorMessage: 'Tahanan Isolasi T-G terlalu rendah. Standar minimum adalah 1.0 MΩ.',
    severity: 'error'
  },
  {
    ruleId: 'grounding_max_5',
    fieldId: 'tahananPentanahan',
    type: 'range',
    params: { max: 5.0 }, // PUIL/Permenaker requires max 5.0 Ω
    errorMessage: 'Tahanan Pentanahan (Grounding) terlalu tinggi. Maksimum standar adalah 5.0 Ω.',
    severity: 'error'
  }
];
