import { ComponentType } from '@angular/cdk/portal';
import { NodeType } from './node-type';
import { LLMConfigSidePanelComponent } from '../../components/side-panels/llm-panel/llm-edit-dialog.component';
import { ProjectSidePanelComponent } from '../../components/side-panels/project-panel/project-side-panel.component';
import { PythonSidePanelComponent } from '../../components/side-panels/python-node/python-side-panel.component';
import { ConditionalEdgeSidePanelComponent } from '../../components/side-panels/coniditonal-edge/conditional-edge-side-panel.component';
import { DecisionTableSidePanelComponent } from '../../components/side-panels/decision-table-side-panel/decision-table-side-panel.component';
import { StartNodeSidePanelComponent } from '../../components/side-panels/start-panel/start-node-side-panel.component';

export const SIDE_PANEL_MAPPING: { [key in NodeType]?: ComponentType<any> } = {
    [NodeType.LLM]: LLMConfigSidePanelComponent,

    [NodeType.PROJECT]: ProjectSidePanelComponent,
    [NodeType.PYTHON]: PythonSidePanelComponent,
    [NodeType.EDGE]: ConditionalEdgeSidePanelComponent,
    [NodeType.TABLE]: DecisionTableSidePanelComponent,
    [NodeType.START]: StartNodeSidePanelComponent,
};
