export interface LlmLibraryModel {
  id: number;
  customName: string;
  modelName: string;
  tags: string[];
  temperature: number;
  usedByCount: number | null; // null = "Ready to be used"
}

