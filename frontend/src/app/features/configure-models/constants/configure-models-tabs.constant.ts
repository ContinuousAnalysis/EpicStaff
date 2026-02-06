import { ConfigureModelsTabId } from '../enums/configure-models-tab-id.enum';
import { ConfigureModelsTab } from '../interfaces/configure-models-tab.interface';

export const CONFIGURE_MODELS_TABS: ConfigureModelsTab[] = [
  { id: ConfigureModelsTabId.QUICKSTART, label: 'Quickstart', iconClass: 'ti ti-bolt' },
  { id: ConfigureModelsTabId.DEFAULT_LLMS, label: 'Default LLMs', iconClass: 'ti ti-robot' },
  { id: ConfigureModelsTabId.LLM_LIBRARY, label: 'LLM Library', iconClass: 'ti ti-books' },
];


