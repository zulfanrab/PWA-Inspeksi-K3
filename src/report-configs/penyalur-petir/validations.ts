// src/report-configs/penyalur-petir/validations.ts
import { ValidationRule } from '../types';

export const validations: ValidationRule[] = [
  {
    ruleId: 'tahanan_grounding_limit',
    fieldId: 'tahananPembumian',
    type: 'range',
    params: { max: 5.0 },
    errorMessage: 'Tahanan Pembumian melebihi batas standar 5.0 Ω (Permenaker No. 02/1989 Pasal 54).',
    severity: 'error',
  },
  {
    ruleId: 'down_conductor_size_limit',
    fieldId: 'luasPenampangHitung',
    type: 'range',
    params: { min: 50.0 },
    errorMessage: 'Luas penampang penghantar penurunan di bawah standar minimum 50 mm².',
    severity: 'warning',
  },
];
