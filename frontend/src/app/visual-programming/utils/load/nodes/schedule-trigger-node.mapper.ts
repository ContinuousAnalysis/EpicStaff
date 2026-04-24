import { v4 as uuidv4 } from 'uuid';

import {
    GetScheduleTriggerNodeRequest,
    ScheduleEndType,
    ScheduleIntervalUnit,
    ScheduleRunMode,
    ScheduleTriggerNodeData,
    WeekdayCode,
} from '../../../../pages/flows-page/components/flow-visual-programming/models/schedule-trigger.model';
import { NodeType } from '../../../core/enums/node-type';
import { ScheduleTriggerNodeModel } from '../../../core/models/node.model';
import { mapNodeDtoMetadataToFlowNodeMetadata } from '../node-dto-metadata-to-flow-metadata.mapper';

function normalizeTimezone(iana: string | null | undefined): string {
    const raw = iana ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return raw === 'Europe/Kiev' ? 'Europe/Kyiv' : raw;
}

export function mapScheduleTriggerNodeToModel(dto: GetScheduleTriggerNodeRequest): ScheduleTriggerNodeModel {
    const ui = mapNodeDtoMetadataToFlowNodeMetadata(dto.metadata, NodeType.SCHEDULE_TRIGGER);

    // schedule may be null for draft nodes that were saved before a schedule was configured.
    const schedule = dto.schedule ?? null;

    const runMode: ScheduleRunMode = schedule?.run_mode ?? 'once';
    const interval = schedule?.interval ?? null;

    const intervalEvery: number | null = interval?.every ?? null;
    const intervalUnit: ScheduleIntervalUnit | null = (interval?.unit as ScheduleIntervalUnit) ?? null;
    const weekdays: WeekdayCode[] = (interval?.weekdays as WeekdayCode[]) ?? [];

    const endType: ScheduleEndType = (schedule?.end?.type as ScheduleEndType) ?? 'never';
    const endDateTime: string | null = endType === 'on_date' ? (schedule?.end?.date_time ?? null) : null;
    const maxRuns: number | null = endType === 'after_n_runs' ? (schedule?.end?.max_runs ?? null) : null;

    const data: ScheduleTriggerNodeData = {
        isActive: dto.is_active,
        runMode,
        startDateTime: schedule?.start_date_time ?? '',
        intervalEvery,
        intervalUnit,
        weekdays,
        endType,
        endDateTime,
        maxRuns,
        currentRuns: dto.current_runs ?? 0,
        timezone: normalizeTimezone(schedule?.timezone),
    };

    return {
        id: uuidv4(),
        backendId: dto.id,
        type: NodeType.SCHEDULE_TRIGGER,
        node_name: dto.node_name,
        nodeNumber: ui.nodeNumber,
        data,
        position: ui.position,
        ports: null,
        color: ui.color,
        icon: ui.icon,
        input_map: {},
        output_variable_path: null,
        size: ui.size,
    };
}
