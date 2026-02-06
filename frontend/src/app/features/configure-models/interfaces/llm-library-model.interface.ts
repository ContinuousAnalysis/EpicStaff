export interface LlmLibraryModel {
  id: string;
  name: string;
  createdBy: string;
  tags: string[];
  temperature: number;
  usedByCount: number | null; // null = "Ready to be used"
}

