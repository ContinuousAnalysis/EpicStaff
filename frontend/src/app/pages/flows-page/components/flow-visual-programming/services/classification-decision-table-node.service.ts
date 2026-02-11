import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
    CreateClassificationConditionGroupRequest,
    CreateClassificationDecisionTableNodeRequest,
    GetClassificationDecisionTableNodeRequest,
} from '../models/classification-decision-table-node.model';
import { ConfigService } from '../../../../../services/config/config.service';
import {
    ClassificationDecisionTableNodeModel,
} from '../../../../../visual-programming/core/models/node.model';

@Injectable({
    providedIn: 'root',
})
export class ClassificationDecisionTableNodeService {
    private headers = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    constructor(
        private http: HttpClient,
        private configService: ConfigService
    ) {}

    private get apiUrl(): string {
        return this.configService.apiUrl + 'classification-decision-table-node/';
    }

    createNode(
        request: CreateClassificationDecisionTableNodeRequest
    ): Observable<GetClassificationDecisionTableNodeRequest> {
        return this.http.post<GetClassificationDecisionTableNodeRequest>(
            this.apiUrl,
            request,
            { headers: this.headers }
        );
    }

    getNodeById(id: number): Observable<GetClassificationDecisionTableNodeRequest> {
        return this.http.get<GetClassificationDecisionTableNodeRequest>(
            `${this.apiUrl}${id}/`,
            { headers: this.headers }
        );
    }

    deleteNode(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}${id}/`, {
            headers: this.headers,
        });
    }

    buildCreatePayload(
        graphId: number,
        node: ClassificationDecisionTableNodeModel,
        resolveNodeName: (idOrName: string | null) => string | null
    ): CreateClassificationDecisionTableNodeRequest {
        const tableData = node.data?.table;

        const conditionGroups: CreateClassificationConditionGroupRequest[] = (
            tableData?.condition_groups || []
        )
            .sort(
                (a: any, b: any) =>
                    (a.order ?? Number.MAX_SAFE_INTEGER) -
                    (b.order ?? Number.MAX_SAFE_INTEGER)
            )
            .map((group: any, index: number) => ({
                group_name: group.group_name,
                order: typeof group.order === 'number' ? group.order : index + 1,
                expression: group.expression || null,
                prompt_id: group.prompt_id || null,
                manipulation: group.manipulation || null,
                continue_flag: !!(group.continue_flag ?? group.continue),
                route_code: group.route_code || null,
                dock_visible: group.dock_visible !== false,
                field_expressions: this.serializeFieldExpressions(group.field_expressions || {}),
                field_manipulations: group.field_manipulations || {},
            }));

        const preComp = tableData?.pre_computation || {};
        const postComp = tableData?.post_computation || {};

        return {
            graph: graphId,
            node_name: node.node_name,
            pre_computation_code: preComp.code || tableData?.pre_computation_code || null,
            pre_input_map: preComp.input_map || tableData?.pre_input_map || null,
            pre_output_variable_path: preComp.output_variable_path || tableData?.pre_output_variable_path || null,
            post_computation_code: postComp.code || tableData?.post_computation_code || null,
            post_input_map: postComp.input_map || tableData?.post_input_map || null,
            post_output_variable_path: postComp.output_variable_path || tableData?.post_output_variable_path || null,
            prompts: tableData?.prompts || {},
            route_variable_name: tableData?.route_variable_name || 'route_code',
            default_next_node: resolveNodeName(tableData?.default_next_node),
            next_error_node: resolveNodeName(tableData?.next_error_node),
            expression_errors_as_false: tableData?.expression_errors_as_false ?? false,
            condition_groups: conditionGroups,
        };
    }

    serializeFieldExpressions(
        fieldExpressions: Record<string, any>
    ): Record<string, string> {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(fieldExpressions)) {
            if (typeof value === 'object' && value !== null && 'operator' in value) {
                const field = value.field || key;
                const op = value.operator || '==';
                const val = value.value;
                result[field] = typeof val === 'string' ? `${op} "${val}"` : `${op} ${val}`;
            } else {
                result[key] = String(value);
            }
        }
        return result;
    }
}
