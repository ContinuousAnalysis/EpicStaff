export interface ClassificationConditionGroupBackend {
    id: number;
    classification_decision_table_node: number;
    group_name: string;
    order: number;
    expression: string | null;
    prompt_id: string | null;
    manipulation: string | null;
    continue_flag: boolean;
    route_code: string | null;
    dock_visible: boolean;
    field_expressions: Record<string, string>;
    field_manipulations: Record<string, string>;
}

export interface CreateClassificationConditionGroupRequest {
    group_name: string;
    order: number;
    expression: string | null;
    prompt_id: string | null;
    manipulation: string | null;
    continue_flag: boolean;
    route_code: string | null;
    dock_visible: boolean;
    field_expressions: Record<string, string>;
    field_manipulations: Record<string, string>;
}

export interface GetClassificationDecisionTableNodeRequest {
    id: number;
    graph: number;
    node_name: string;
    pre_computation_code: string | null;
    pre_input_map: Record<string, string>;
    pre_output_variable_path: string | null;
    post_computation_code: string | null;
    post_input_map: Record<string, string>;
    post_output_variable_path: string | null;
    prompts: Record<string, unknown>;
    route_variable_name: string;
    default_next_node: string | null;
    next_error_node: string | null;
    condition_groups: ClassificationConditionGroupBackend[];
    expression_errors_as_false: boolean;
    metadata?: unknown;
}

export interface CreateClassificationDecisionTableNodeRequest {
    graph: number;
    node_name: string;
    pre_computation_code: string | null;
    pre_input_map: Record<string, string> | null;
    pre_output_variable_path: string | null;
    post_computation_code: string | null;
    post_input_map: Record<string, string> | null;
    post_output_variable_path: string | null;
    prompts: Record<string, unknown>;
    route_variable_name: string;
    default_next_node: string | null;
    next_error_node: string | null;
    condition_groups: CreateClassificationConditionGroupRequest[];
    expression_errors_as_false: boolean;
    metadata?: unknown;
}
