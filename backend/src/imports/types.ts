export type CreateImportResult = { id: string; replayed: boolean };

export const TARGET_FIELDS = [
  'email',
  'name',
  'company',
  'jobTitle',
  'phone',
  'status',
  '__ignore__',
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number];

export type ColumnMapping = {
  sourceColumn: string;
  targetField: TargetField;
  confidence: number;
};
