import {
    ChangeDetectionStrategy,
    Component, computed,
    DestroyRef,
    inject,
    input, OnChanges,
    OnInit, signal, SimpleChanges
} from '@angular/core';
import { FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
    NgrokConfigStorageService
} from "../../../../features/settings-dialog/services/ngrok-config/ngrok-config-storage.service";
import { ToastService } from "../../../../services/notifications";
import { WebhookTriggerNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import { CustomInputComponent, SelectComponent, SelectItem } from '@shared/components';
import {
    CodeEditorComponent
} from '../../../../user-settings-page/tools/custom-tool-editor/code-editor/code-editor.component';
import { CommonModule } from '@angular/common';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

export const WEBHOOK_NAME_PATTERN = /^[A-Za-z0-9\-._~/]*$/;

@Component({
    standalone: true,
    selector: 'app-webhook-trigger-node-panel',
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        CodeEditorComponent,
        CommonModule,
        ClipboardModule,
        SelectComponent,
    ],
    templateUrl: 'webhook-trigger-node-panel.component.html',
    styleUrls: ['webhook-trigger-node-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebhookTriggerNodePanelComponent extends BaseSidePanel<WebhookTriggerNodeModel> implements OnInit, OnChanges {
    private readonly destroyRef = inject(DestroyRef);
    private readonly ngrokStorageService = inject(NgrokConfigStorageService);
    private readonly clipboard = inject(Clipboard);
    private readonly toastService = inject(ToastService);

    public readonly isExpanded = input<boolean>(false);

    public readonly isCodeEditorFullWidth = signal<boolean>(true);
    ngrokConfigsLoading = signal<boolean>(false);
    webhookPath = signal<string | null>(null);
    ngrokConfigUrl = signal<string | null>(null);
    loadingTunnel = signal<boolean>(false);
    ngrokConfigs = this.ngrokStorageService.configs;

    pythonCode: string = '';
    initialPythonCode: string = '';
    codeEditorHasError: boolean = false;

    webhookUrlDisplay = computed<string | null>(() => {
        const configUrl = this.ngrokConfigUrl();
        const path = this.webhookPath();

        if (!configUrl || !path) return null;

        return configUrl + path;
    });
    ngrokConfigSelectItems = computed<SelectItem[]>(() => {
        return this.ngrokStorageService.configs().map(c => ({ name: c.name, value: c.id }))
    });

    constructor() {
        super();
    }

    ngOnInit() {
        this.getNgrokConfigs();
    }

    ngOnChanges(changes: SimpleChanges) {
        this.ngrokConfigUrl.set(null);
        this.getTunnel();
    }

    private getNgrokConfigs(): void {
        this.ngrokConfigsLoading.set(true);
        this.ngrokStorageService.getConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {},
                error: () => this.toastService.error('Failed to load Ngrok configs.'),
                complete: () => this.ngrokConfigsLoading.set(false),
            })
    }

    private getTunnel() {
        const id = this.node().data.webhook_trigger?.ngrok_webhook_config;
        const path = this.node().data.webhook_trigger?.path;
        if (!id || !path) return;
        this.loadingTunnel.set(true);

        this.ngrokStorageService.getConfigById(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    if (response.webhook_full_url) {
                        this.ngrokConfigUrl.set(this.normalizeWebhookBase(response.webhook_full_url));
                    } else {
                        this.ngrokConfigUrl.set(null);
                    }
                },
                error: () => {
                    this.ngrokConfigUrl.set(null);
                },
                complete: () => this.loadingTunnel.set(false),
            });
    }

    get activeColor(): string {
        return this.node().color || '#685fff';
    }

    onPythonCodeChange(code: string): void {
        this.pythonCode = code;
    }

    onCodeErrorChange(hasError: boolean): void {
        this.codeEditorHasError = hasError;
    }

    initializeForm(): FormGroup {
        const form = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
            libraries: [this.node().data.python_code.libraries?.join(', ') || ''],
            webhook_trigger_path: [this.node().data.webhook_trigger?.path || null,
                [Validators.required, Validators.pattern(WEBHOOK_NAME_PATTERN)]
            ],
            ngrok_webhook_config: [this.node().data.webhook_trigger?.ngrok_webhook_config || null],
        });
        form
            .get('webhook_trigger_path')
            ?.valueChanges.pipe(
                startWith(form.get('webhook_trigger_path')?.value ?? ''),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe((value: string | null) => {
                this.webhookPath.set(value);
            });
        this.pythonCode = this.node().data.python_code.code || '';
        this.initialPythonCode = this.pythonCode;
        return form;
    }

    onNgrokConfigChange(id: number): void {
        const config = this.ngrokConfigs().find(c => c.id === id);

        if (!config || !config.webhook_full_url) return;

        this.ngrokConfigUrl.set(this.normalizeWebhookBase(config.webhook_full_url))
    }

    createUpdatedNode(): WebhookTriggerNodeModel {
        const librariesArray = this.form.value.libraries
            ? this.form.value.libraries
                .split(',')
                .map((lib: string) => lib.trim())
                .filter((lib: string) => lib.length > 0)
            : [];

        const webhookTriggerPath = this.form.value.webhook_trigger_path;

        const webhook_trigger = webhookTriggerPath ? {
            path: webhookTriggerPath,
            ngrok_webhook_config: this.form.value.ngrok_webhook_config,
        } : null;

        return {
            ...this.node(),
            node_name: this.form.value.node_name,
            input_map: {},
            output_variable_path: null,
            data: {
                ...this.node().data,
                webhook_trigger,
                python_code: {
                    name: this.node().data.python_code.name || 'Python Code',
                    code: this.pythonCode,
                    entrypoint: 'main',
                    libraries: librariesArray,
                }
            },
        };
    }

    private normalizeWebhookBase(tunnelUrl: string): string {
        if (!tunnelUrl) {
            return '';
        }
        const sanitized = tunnelUrl.endsWith('/') ? tunnelUrl.slice(0, -1) : tunnelUrl;
        return `${sanitized}/webhooks/`;
    }

    getWebhookNameErrorMessage(): string {
        const control = this.form?.get('webhookName');
        if (!control || control.valid || !control.errors) {
            return '';
        }
        if (control.errors['pattern']) {
            return 'Use only letters, numbers, "-", "_", ".", "~", or "/"';
        }
        return '';
    }

    copyWebhookUrl(): void {
        const url = this.webhookUrlDisplay()
        if (!url) return;

        this.clipboard.copy(url);
    }

    toggleCodeEditorFullWidth(): void {
        this.isCodeEditorFullWidth.update((value) => !value);
    }
}
