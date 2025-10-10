import {
    Component,
    Inject,
    OnInit,
    ChangeDetectionStrategy,
    signal,
    computed,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { JsonEditorComponent } from '../../../../shared/components/json-editor/json-editor.component';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';

export interface AdvancedTaskSettingsData {
    config: any | null;
    output_model: any | null;
    task_context_list: number[];
    taskName: string;
    taskId: number | string | null;
    availableTasks?: any[];
}

@Component({
    selector: 'app-advanced-task-settings-dialog',
    standalone: true,
    imports: [
        NgIf,
        NgFor,
        NgClass,
        FormsModule,
        MatSlideToggleModule,
        JsonEditorComponent,
        HelpTooltipComponent,
    ],
    templateUrl: './advanced-task-settings-dialog.component.html',
    styleUrls: ['./advanced-task-settings-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdvancedTaskSettingsDialogComponent implements OnInit {
    public taskData: AdvancedTaskSettingsData;
    public jsonConfig = signal<string>('{}');
    public isJsonValid = signal<boolean>(true);
    public selectedTaskIds = signal<number[]>([]);
    public readonly availableTasks: any[];
    public useOutputModel = signal<boolean>(false);

    constructor(
        public dialogRef: DialogRef<AdvancedTaskSettingsData>,
        @Inject(DIALOG_DATA) public data: AdvancedTaskSettingsData
    ) {
        console.log('Dialog data:', data);
        this.taskData = {
            ...data,
            config: null,
            task_context_list: data.task_context_list || [],
            output_model: data.output_model || null,
            taskId: data.taskId,
        };

        this.availableTasks = [...(data.availableTasks || [])].sort((a, b) => {
            if (a.order === null && b.order === null) {
                return 0;
            }
            if (a.order === null) {
                return 1;
            }
            if (b.order === null) {
                return -1;
            }
            return a.order - b.order;
        });

        const initialSelectedIds = Array.isArray(data.task_context_list)
            ? [...data.task_context_list].map((id) =>
                  typeof id === 'string' ? parseInt(id, 10) : id
              )
            : [];

        this.selectedTaskIds.set(initialSelectedIds);

        // Initialize useOutputModel based on whether output_model exists
        this.useOutputModel.set(
            this.taskData.output_model !== null &&
                this.taskData.output_model !== undefined
        );
    }

    public ngOnInit(): void {
        const savedSchema = this.loadSchemaFromLocalStorage();

        if (savedSchema) {
            this.jsonConfig.set(this.stripTypeAndTitle(savedSchema));
        } else if (this.taskData.output_model) {
            try {
                const outputModel = this.taskData.output_model;
                const schemaString = JSON.stringify(outputModel, null, 2);
                this.jsonConfig.set(this.stripTypeAndTitle(schemaString));
            } catch (e) {
                this.jsonConfig.set(this.getDefaultJsonSchema());
            }
        } else {
            this.jsonConfig.set(this.getDefaultJsonSchema());
        }
    }

    private getDefaultJsonSchema(): string {
        const defaultSchema = {
            properties: {},
            required: [],
        };
        return JSON.stringify(defaultSchema, null, 2);
    }

    private stripTypeAndTitle(schemaString: string): string {
        try {
            const schema = JSON.parse(schemaString);
            const { type, title, ...rest } = schema;
            return JSON.stringify(rest, null, 2);
        } catch (e) {
            return schemaString;
        }
    }

    private getLocalStorageKey(): string | null {
        if (!this.taskData.taskId) {
            return null;
        }
        return `task_output_schema_${this.taskData.taskId}`;
    }

    private loadSchemaFromLocalStorage(): string | null {
        const key = this.getLocalStorageKey();
        if (!key) {
            return null;
        }

        try {
            const savedSchema = localStorage.getItem(key);
            if (savedSchema) {
                JSON.parse(savedSchema);
                return savedSchema;
            }
        } catch (e) {
            localStorage.removeItem(key);
        }
        return null;
    }

    private saveSchemaToLocalStorage(): void {
        const key = this.getLocalStorageKey();
        if (!key) {
            return;
        }

        try {
            if (this.jsonConfig()) {
                localStorage.setItem(key, this.jsonConfig());
            }
        } catch (e) {
            console.error('Error saving schema to localStorage:', e);
        }
    }

    public onJsonValidChange(isValid: boolean): void {
        this.isJsonValid.set(isValid);
    }

    public resetToDefault(): void {
        this.jsonConfig.set(this.getDefaultJsonSchema());
    }

    public toggleTaskSelection(taskId: number): void {
        const currentSelection = this.selectedTaskIds();
        const index = currentSelection.indexOf(taskId);

        if (index === -1) {
            // Task is not selected, add it
            this.selectedTaskIds.set([...currentSelection, taskId]);
        } else {
            // Task is already selected, remove it
            const updatedSelection = [...currentSelection];
            updatedSelection.splice(index, 1);
            this.selectedTaskIds.set(updatedSelection);
        }

        console.log('Updated selected task IDs:', this.selectedTaskIds());
    }

    public isTaskSelected(taskId: number): boolean {
        return this.selectedTaskIds().includes(taskId);
    }

    // Helper to format order display
    public formatOrder(order: number | null): string {
        return order === null ? 'null' : `${order}`;
    }

    public tryProcessOutputModel(jsonString: string): any | null {
        if (!jsonString) return null;

        try {
            const parsedJson = JSON.parse(jsonString);

            const hasProperties =
                parsedJson.properties &&
                Object.keys(parsedJson.properties).length > 0;

            if (!hasProperties) {
                return null;
            }

            return {
                type: 'object',
                title: 'TaskOutputModel',
                ...parsedJson,
            };
        } catch (e) {
            console.error('Error processing output model:', e);
            return null;
        }
    }

    public save(): void {
        if (this.useOutputModel() && !this.isJsonValid()) {
            return;
        }

        try {
            let outputModel = null;

            if (this.useOutputModel()) {
                outputModel = this.tryProcessOutputModel(this.jsonConfig());
            }

            this.saveSchemaToLocalStorage();

            const result = {
                ...this.taskData,
                config: null,
                output_model: outputModel,
                task_context_list: this.selectedTaskIds(),
            };

            console.log('Saving data:', result);
            this.dialogRef.close(result);
        } catch (e) {
            console.error('Invalid JSON format:', e);
            this.isJsonValid.set(false);
        }
    }
}
