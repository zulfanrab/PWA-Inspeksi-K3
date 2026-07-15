// src/report-configs/registry.ts
import { InspectionReportConfig } from './types';
import { meta as ilMeta } from './instalasi-listrik/meta';
import { forms as ilForms } from './instalasi-listrik/forms';
import { checklists as ilChecklists } from './instalasi-listrik/checklists';
import { formulas as ilFormulas } from './instalasi-listrik/formulas';
import { validations as ilValidations } from './instalasi-listrik/validations';
import { aiPrompts as ilAiPrompts } from './instalasi-listrik/ai-prompts';

import { meta as ippMeta } from './penyalur-petir/meta';
import { forms as ippForms } from './penyalur-petir/forms';
import { checklists as ippChecklists } from './penyalur-petir/checklists';
import { formulas as ippFormulas } from './penyalur-petir/formulas';
import { validations as ippValidations } from './penyalur-petir/validations';
import { aiPrompts as ippAiPrompts } from './penyalur-petir/ai-prompts';

const registry: Record<string, InspectionReportConfig> = {
  IL: {
    meta: ilMeta,
    forms: ilForms,
    checklists: ilChecklists,
    formulas: ilFormulas,
    validations: ilValidations,
    aiPrompts: ilAiPrompts
  },
  IPP: {
    meta: ippMeta,
    forms: ippForms,
    checklists: ippChecklists,
    formulas: ippFormulas,
    validations: ippValidations,
    aiPrompts: ippAiPrompts
  }
};

// Aliases for historical / existing names if necessary
// Map 'Listrik' to 'IL' and 'Penyalur Petir' to 'IPP'
export function mapObjectTypeToCode(objectType: string): string {
  const clean = objectType.trim().toLowerCase();
  if (clean === 'listrik' || clean === 'instalasi listrik') return 'IL';
  if (clean === 'penyalur petir' || clean === 'instalasi penyalur petir' || clean === 'ipp') return 'IPP';
  return objectType;
}

export function getConfigByCode(code: string): InspectionReportConfig | null {
  const resolvedCode = mapObjectTypeToCode(code);
  return registry[resolvedCode] || null;
}

export function getRegisteredTypes() {
  return Object.values(registry).map(cfg => cfg.meta);
}
