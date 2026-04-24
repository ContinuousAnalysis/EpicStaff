export type WeekdayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ScheduleRunMode = 'once' | 'repeat';

export type ScheduleIntervalUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

export type ScheduleEndType = 'never' | 'on_date' | 'after_n_runs';

export interface ScheduleIntervalBlock {
    every: number;
    unit: ScheduleIntervalUnit;
    weekdays: WeekdayCode[];
}

export interface ScheduleEndBlock {
    type: ScheduleEndType;
    date_time: string | null;
    max_runs: number | null;
}

export interface ScheduleBlock {
    run_mode: ScheduleRunMode;
    start_date_time: string;
    interval: ScheduleIntervalBlock | null;
    end: ScheduleEndBlock;
    timezone: string;
}

/** Shape returned by GET /api/schedule-trigger-nodes/{id}/ and as the response body of POST/PUT/PATCH. */
export interface GetScheduleTriggerNodeRequest {
    id: number;
    node_name: string;
    graph: number;
    is_active: boolean;
    metadata: Record<string, unknown>;
    content_hash: string;
    created_at: string;
    updated_at: string;
    current_runs: number;
    schedule: ScheduleBlock;
}

/** Request body for POST /api/schedule-trigger-nodes/ and PUT /api/schedule-trigger-nodes/{id}/. */
export interface CreateScheduleTriggerNodeRequest {
    node_name: string;
    graph: number;
    is_active?: boolean;
    metadata?: Record<string, unknown>;
    schedule: ScheduleBlock;
}

/** Request body for PATCH /api/schedule-trigger-nodes/{id}/. All fields optional; if schedule is included the full block is required. */
export interface PatchScheduleTriggerNodeRequest {
    node_name?: string;
    is_active?: boolean;
    metadata?: Record<string, unknown>;
    schedule?: ScheduleBlock;
}

/** Internal frontend node.data shape for the Schedule Trigger node. Separate from the backend DTO. */
export interface ScheduleTriggerNodeData {
    isActive: boolean;
    runMode: ScheduleRunMode;
    startDateTime: string;
    intervalEvery: number | null;
    intervalUnit: ScheduleIntervalUnit | null;
    weekdays: WeekdayCode[];
    endType: ScheduleEndType;
    endDateTime: string | null;
    maxRuns: number | null;
    currentRuns?: number;
    timezone: string;
}
