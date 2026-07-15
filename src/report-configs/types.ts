// src/report-configs/types.ts

export interface FormFieldConfig {
  fieldId: string;
  section: 'general' | 'technical' | 'testing';
  label: string;
  labelEn?: string;
  type: 'text' | 'number' | 'select' | 'date' | 'boolean' | 'textarea';
  placeholder?: string;
  required: boolean;
  options?: string[];               // For select type
  unit?: string;                    // e.g., "MΩ", "V"
  defaultValue?: string | number;
  helpText?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    customRule?: string;            // Reference to ValidationRule.ruleId
  };
  mappedPlaceholder: string;        // Maps to Word template placeholder e.g., "{tegangan_nominal}"
}

export interface MasterComponentRef {
  componentId: string;
  componentName: string;
  isDefault: boolean;               // Whether automatically selected
  items: {
    itemId: string;
    description: string;
    standard?: string;
  }[];
}

export interface ChecklistConfig {
  version: string;
  categories: {
    categoryId: string;
    categoryName: string;
    components: MasterComponentRef[];
  }[];
}

export interface FormulaConfig {
  formulaId: string;
  formulaName: string;
  description: string;
  inputFields: string[];            // References to FormFieldConfig.fieldId
  formula: string;                  // Math expression or function
  resultUnit: string;
  threshold: number;
  thresholdType: 'MAX' | 'MIN';
  standardRef?: string;
}

export interface ValidationRule {
  ruleId: string;
  fieldId: string;
  type: 'range' | 'required' | 'custom' | 'cross_field' | 'conditional';
  params: Record<string, any>;
  errorMessage: string;
  severity: 'error' | 'warning';
}

export interface AIPromptConfig {
  systemPrompt: string;
  sectionPrompts: {
    executiveSummary: string;
    findings: string;
    testResults: string;
    recommendations: string;
    conclusion: string;
  };
  rules: string[];                  // e.g., "NEVER do math", "Use formal Indonesian"
  contextTemplate: string;          // Template for structured context injection
  maxTokens: number;
  temperature: number;
}

export interface InspectionTypeMeta {
  code: string;                     // e.g., "IL"
  name: string;                     // e.g., "Instalasi Listrik"
  icon: string;                     // e.g., "lightning-bolt"
  templateDriveId?: string;         // Default template ID in Google Drive
}

export interface InspectionReportConfig {
  meta: InspectionTypeMeta;
  forms: FormFieldConfig[];
  checklists: ChecklistConfig;
  formulas: FormulaConfig[];
  validations: ValidationRule[];
  aiPrompts: AIPromptConfig;
}
