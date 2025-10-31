import { Type } from '@angular/core';
import { NodePanel } from '../models/node-panel.interface';
import { ProjectNodePanelComponent } from '../../components/node-panels/project-node-panel/project-node-panel.component';
import { PythonNodePanelComponent } from '../../components/node-panels/python-node-panel/python-node-panel.component';
import { ConditionalEdgeNodePanelComponent } from '../../components/node-panels/conditional-edge-node-panel/conditional-edge-node-panel.component';
import { EndNodePanelComponent } from '../../components/node-panels/end-node-panel/end-node-panel.component';
import { FileExtractorNodePanelComponent } from '../../components/node-panels/file-extractor-node-panel/file-extractor-node-panel.component';
import { AudioToTextNodePanelComponent } from '../../components/node-panels/audio-to-text-node-panel/audio-to-text-node-panel.component';
import { NodeType } from './node-type';

export const PANEL_COMPONENT_MAP: Record<string, Type<NodePanel<any>>> = {
    [NodeType.PYTHON]: PythonNodePanelComponent,
    [NodeType.PROJECT]: ProjectNodePanelComponent,
    [NodeType.EDGE]: ConditionalEdgeNodePanelComponent,
    [NodeType.FILE_EXTRACTOR]: FileExtractorNodePanelComponent,
    [NodeType.END]: EndNodePanelComponent,
    [NodeType.AUDIO_TO_TEXT]: AudioToTextNodePanelComponent,
    // start: StartNodePanelComponent,
};
