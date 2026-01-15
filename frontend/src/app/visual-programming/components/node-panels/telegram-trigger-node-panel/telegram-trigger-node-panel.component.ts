import {ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal} from "@angular/core";
import {BaseSidePanel} from "../../../core/models/node-panel.abstract";
import {TelegramTriggerNodeModel} from "../../../core/models/node.model";
import {FormGroup, ReactiveFormsModule, Validators} from "@angular/forms";
import {CustomInputComponent} from "../../../../shared/components/form-input/form-input.component";
import {Clipboard} from "@angular/cdk/clipboard";
import {ButtonComponent} from "../../../../shared/components/buttons/button/button.component";
import {AppIconComponent} from "../../../../shared/components/app-icon/app-icon.component";
import {MATERIAL_FORMS} from "../../../../shared/material-forms";
import {SelectItem} from "../../../../shared/components/select/select.component";
import {MultiSelectComponent} from "../../../../shared/components/multi-select/multi-select.component";
import {Dialog} from "@angular/cdk/dialog";
import {
    TelegramTriggerEditingDialogComponent
} from "../../telegram-trigger-editing-dialog/telegram-trigger-editing-dialog.component";
import {
    TelegramTriggerNodeService
} from "../../../../pages/flows-page/components/flow-visual-programming/services/telegram-trigger-node.service";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {WebhookService} from "../../../../pages/flows-page/components/flow-visual-programming/services/webhook.service";
import {WebhookStatus} from "../../../../pages/flows-page/components/flow-visual-programming/models/webhook.model";
import {FlowService} from "../../../services/flow.service";
import {FlowsStorageService} from "../../../../features/flows/services/flows-storage.service";

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
        MultiSelectComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TelegramTriggerNodePanelComponent extends BaseSidePanel<TelegramTriggerNodeModel> implements OnInit {
    public readonly isExpanded = input<boolean>(false);

    private clipboard = inject(Clipboard);
    private dialog = inject(Dialog);
    private flowService = inject(FlowService);
    private flowsService = inject(FlowsStorageService);

    selectItems: SelectItem[] = [];
    selectedItems: SelectItem[] = [];

    showWebhookSection = computed(() => {
        // if node is existing, it will have a numeric id
        return typeof this.node().id === 'number'
    });
    webhookStatus = signal<WebhookStatus | 'pending' | 'registering'>('pending');

    constructor(
        private webhookService: WebhookService,
        private telegramTriggerNodeService: TelegramTriggerNodeService,
        private destroyRef: DestroyRef,
    ) {
        super();
        this.webhookService.getTunnel().subscribe({
            next: (response) => {
                this.webhookStatus.set(response.status);
            },
            error: () => {
                this.webhookStatus.set(WebhookStatus.FAIL);
            }
        })
    }

    ngOnInit() {
        this.telegramTriggerNodeService.getTelegramTriggerAvailableFields()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    console.log(response);
                },
                error: (err) => {
                    console.log(err);
                }
            })
    }

    initializeForm(): FormGroup {
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
        const control = this.form?.get('telegram_bot_key');
        if (!control || control.valid || !control.errors) {
            return '';
        }
        if (control.errors['pattern']) {
            return 'Use only letters, numbers, "-", "_", ".", "~", or "/"';
        }
        return '';
    }

    onWebhookRegister(): void {
        // console.log(this.node());
        // this.flowsService.getFlows().subscribe(v => console.log(v))
        this.flowsService.getFlowById(2).subscribe(v => console.log(v))
    }

    onEditing(): void {
        this.dialog.open(
            TelegramTriggerEditingDialogComponent,
            {
                width: 'calc(100vw - 2rem)',
                height: 'calc(100vh - 2rem)',
                autoFocus: true,
                disableClose: true,
            }
        )
    }

    get activeColor(): string {
        return this.node().color || '#685fff';
    }

    protected readonly WebhookStatus = WebhookStatus;
}
