// src/report-configs/penyalur-petir/validations.ts
import { ValidationRule } from '../types';

export const validations: ValidationRule[] = [
  {
    ruleId: 'tahanan_grounding_limit',
    fieldId: 'tahananPembumian',
    type: 'range',
    params: { max: 5.0 },
    errorMessage: 'Tahanan Pembumian melebihi batas standar 5.0 Ω. Bahaya kegagalan penyaluran petir.',
    severity: 'error'
  },
  {
    ruleId: 'down_conductor_size_limit',
    fieldId: 'ukuranDownConductor',
    type: 'range',
    params: { min: 50.0 },
    errorMessage: 'Penampang down conductor di bawah standar minimum 50 mm² (bisa memicu overheating saat pelepasan arus petir).',
    severity: 'error'
  }
];
