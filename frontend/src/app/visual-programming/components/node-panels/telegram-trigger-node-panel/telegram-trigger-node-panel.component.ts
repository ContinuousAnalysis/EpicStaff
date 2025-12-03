import {ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal} from "@angular/core";
import {BaseSidePanel} from "../../../core/models/node-panel.abstract";
import {TelegramTriggerNodeModel} from "../../../core/models/node.model";
import {FormGroup, ReactiveFormsModule, Validators} from "@angular/forms";
import {CustomInputComponent} from "../../../../shared/components/form-input/form-input.component";
import {ButtonComponent} from "../../../../shared/components/buttons/button/button.component";
import {AppIconComponent} from "../../../../shared/components/app-icon/app-icon.component";
import {MATERIAL_FORMS} from "../../../../shared/material-forms";
import {Dialog} from "@angular/cdk/dialog";
import {
    TelegramTriggerEditingDialogComponent
} from "../../telegram-trigger-editing-dialog/telegram-trigger-editing-dialog.component";
import {WebhookService} from "../../../../pages/flows-page/components/flow-visual-programming/services/webhook.service";
import {WebhookStatus} from "../../../../pages/flows-page/components/flow-visual-programming/models/webhook.model";
import {JsonEditorComponent} from "../../../../shared/components/json-editor/json-editor.component";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {tap} from "rxjs/operators";
import {
    DisplayedTelegramField,
    TelegramTriggerNodeField,
} from "../../../../pages/flows-page/components/flow-visual-programming/models/telegram-trigger.model";
import {TELEGRAM_TRIGGER_FIELDS} from "../../../core/constants/telegram-trigger-fields";

@Component({
    selector: 'app-telegram-trigger-node-panel',
    templateUrl: './telegram-trigger-node-panel.component.html',
    styleUrls: ['./telegram-trigger-node-panel.component.scss'],
    imports: [
        CustomInputComponent,
        ReactiveFormsModule,
        ButtonComponent,
        AppIconComponent,
        MATERIAL_FORMS,
        JsonEditorComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TelegramTriggerNodePanelComponent extends BaseSidePanel<TelegramTriggerNodeModel> {
    public readonly isExpanded = input<boolean>(false);

    private dialog = inject(Dialog);
    private destroyRef = inject(DestroyRef);
    private webhookService = inject(WebhookService);

    webhookStatus = signal<WebhookStatus | 'pending' | 'registering'>('pending');

    selectedFields = signal<DisplayedTelegramField[]>([]);
    jsonValues = computed(() => {
        const checkedItemsObj = this.selectedFields().reduce<Record<string, any>>((acc, field) => {
            acc[field.field_name] = field.model;
            return acc;
        }, {});

        return JSON.stringify(checkedItemsObj, null, 2);
    });

    editorOptions: any = {
        lineNumbers: 'off',
        theme: 'vs-dark',
        language: 'json',
        automaticLayout: true,
        minimap: {enabled: false},
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        wrappingIndent: 'indent',
        wordWrapBreakAfterCharacters: ',',
        wordWrapBreakBeforeCharacters: '}]',
        tabSize: 2,
        readOnly: true,
    };

    constructor() {
        super();
        this.getTunnelStatus();
    }

    private getTunnelStatus(): void {
        this.webhookService.getTunnel()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => this.webhookStatus.set(response.status),
                error: () => this.webhookStatus.set(WebhookStatus.FAIL)
            });
    }

    private setSelectedFields(nodeFields: TelegramTriggerNodeField[]): void {
        const selectedFields = nodeFields.map((nodeField: TelegramTriggerNodeField) => {
            const parentFields = TELEGRAM_TRIGGER_FIELDS[nodeField.parent];
            const fieldWithModel = parentFields.find(f => f.field_name === nodeField.field_name)!;

            return {
                ...fieldWithModel,
                parent: nodeField.parent,
                variable_path: nodeField.variable_path,
            }
        });

        this.selectedFields.set(selectedFields);
    }

    initializeForm(): FormGroup {
        this.setSelectedFields(this.node().data.fields);
        const form = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
            telegram_bot_api_key: [this.node().data.telegram_bot_api_key || '', Validators.required],
            fields: [this.node().data.fields || []],
        });

        return form;
    }

    createUpdatedNode(): TelegramTriggerNodeModel {
        return {
            ...this.node(),
            node_name: this.form.value.node_name,

            data: {
                ...this.node().data,
                telegram_bot_api_key: this.form.value.telegram_bot_api_key,
                fields: this.form.value.fields
            }
        }
    }

    getTelegramKeyErrorMessage(): string {
        const control = this.form?.get('telegram_bot_api_key');
        if (!control || control.valid || !control.errors) {
            return '';
        }
        if (control.errors['required']) {
            return 'This field is required';
        }
        return '';
    }

    onEditing(): void {
        this.form.value.fields
        const dialog = this.dialog.open(
            TelegramTriggerEditingDialogComponent,
            {
                width: 'calc(100vw - 2rem)',
                height: 'calc(100vh - 2rem)',
                autoFocus: true,
                disableClose: true,
                data: this.selectedFields(),
            }
        );

        dialog.closed
            .pipe(
                tap((selectedFields) => {
                    if (!selectedFields) return;

                    const fields = selectedFields as TelegramTriggerNodeField[];
                    this.setSelectedFields(fields);
                    this.updateFieldsControl(fields);
                }),
                takeUntilDestroyed(this.destroyRef),
            ).subscribe()
    }

    private updateFieldsControl(items: TelegramTriggerNodeField[]) {
        const control = this.form.get('fields');
        control?.setValue(items);
    }

    get activeColor(): string {
        return this.node().color || '#685fff';
    }

    protected readonly WebhookStatus = WebhookStatus;
}
