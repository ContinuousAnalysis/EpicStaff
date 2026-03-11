export interface ImportResultItem {
  id: number | string;
  name: string;
}

export interface EntityTypeResult {
  total: number;
  created: {
    count: number;
    items: ImportResultItem[];
  };
  reused: {
    count: number;
    items: ImportResultItem[];
  };
}

export interface ImportResult {
  [entityType: string]: EntityTypeResult;
}

export interface ImportResultDialogData {
  importResult: ImportResult;
}
