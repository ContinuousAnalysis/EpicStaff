import { ModelTypes } from '@shared/models';

import { GetDefaultModelsResponse } from '../models/default-models.model';

export interface DefaultLlmsCard {
    id: string;
    field: keyof GetDefaultModelsResponse;
    title: string;
    description: string;
    selectLabel: string;
    icon: string;
    configType: ModelTypes;
}
