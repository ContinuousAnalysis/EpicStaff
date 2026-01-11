import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    effect,
    inject,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    FormArray,
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import { WebScraperNodeModel } from '../../../core/models/node.model';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { CustomSelectComponent } from '../../../../shared/components/form-select/form-select.component';
import { EsDurationPickerComponent } from '../../../../shared/components/epicstaff-components/es-duration-picker/es-duration-picker.component';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';
import { FullEmbeddingConfig, FullEmbeddingConfigService } from '../../../../services/full-embedding.service';

@Component({
    standalone: true,
    selector: 'app-web-scraper-node-panel',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CustomInputComponent,
        CustomSelectComponent,
        EsDurationPickerComponent,
        HelpTooltipComponent,
    ],
    template: `
        <div class="panel-container">
            <div class="panel-content">
                <form [formGroup]="form" class="form-container">
                    <app-custom-input
                        label="Node Name"
                        tooltipText="Unique name for this web scraper node."
                        formControlName="node_name"
                        placeholder="Enter node name"
                        [activeColor]="activeColor"
                        [errorMessage]="getNodeNameErrorMessage()"
                    ></app-custom-input>

                    <!-- URL Input List Section -->
                    <div class="input-map-container">
                        <div class="input-map-header">
                            <label>Input List</label>
                            <app-help-tooltip
                                position="right"
                                text="URLs to scrape. Use a variable path or enter custom URLs."
                            ></app-help-tooltip>
                        </div>

                        <div class="input-grid">
                            <!-- Main row -->
                            <div class="grid-key">
                                <input
                                    type="text"
                                    value="urls"
                                    disabled
                                    class="key-input"
                                />
                            </div>
                            <div class="grid-equals">=</div>
                            <div class="grid-value">
                                @if (urlSourceType() === 'variable') {
                                    <input
                                        type="text"
                                        formControlName="urls_variable"
                                        placeholder="variables."
                                        [style.--active-color]="activeColor"
                                        autocomplete="off"
                                    />
                                } @else {
                                    <div class="custom-badge">
                                        <span>{{ customUrls.length }} URL(s)</span>
                                    </div>
                                }
                            </div>
                            <div class="grid-actions">
                                <button
                                    type="button"
                                    class="toggle-btn"
                                    [class.active]="urlSourceType() === 'variable'"
                                    (click)="setUrlSourceType('variable')"
                                    title="From Variable"
                                >
                                    <i class="ti ti-variable"></i>
                                </button>
                                <button
                                    type="button"
                                    class="toggle-btn"
                                    [class.active]="urlSourceType() === 'custom'"
                                    (click)="setUrlSourceType('custom')"
                                    title="Custom URLs"
                                >
                                    <i class="ti ti-list"></i>
                                </button>
                            </div>

                            <!-- Custom URLs rows -->
                            @if (urlSourceType() === 'custom') {
                                @for (url of customUrls.controls; track $index) {
                                    <div class="grid-spacer"></div>
                                    <div class="grid-spacer"></div>
                                    <div class="grid-value">
                                        <input
                                            type="text"
                                            [formControl]="getUrlControl($index)"
                                            placeholder="https://example.com"
                                            [style.--active-color]="activeColor"
                                            autocomplete="off"
                                        />
                                    </div>
                                    <div class="grid-actions">
                                        <i
                                            class="ti ti-trash delete-icon"
                                            (click)="removeUrl($index)"
                                            [class.disabled]="customUrls.length <= 1"
                                        ></i>
                                    </div>
                                }
                                <div class="grid-spacer"></div>
                                <div class="grid-spacer"></div>
                                <div class="grid-value">
                                    <button type="button" class="add-pair-btn" (click)="addUrl()">
                                        <i class="ti ti-plus"></i> Add URL
                                    </button>
                                </div>
                                <div class="grid-spacer"></div>
                            }
                        </div>
                    </div>

                    <app-custom-input
                        label="Output Variable Path"
                        tooltipText="The path where the output of this node will be stored in your flow variables."
                        formControlName="output_variable_path"
                        placeholder="Enter output variable path (leave empty for null)"
                        [activeColor]="activeColor"
                    ></app-custom-input>

                    <app-custom-input
                        label="Collection Name"
                        tooltipText="Knowledge collection where scraped content is stored."
                        formControlName="collection_name"
                        placeholder="Enter collection name"
                        [activeColor]="activeColor"
                        [errorMessage]="getCollectionNameError()"
                    ></app-custom-input>

                    <app-custom-select
                        label="Embedding Config"
                        tooltipText="Required. Pick the embedding config used to vectorize scraped content."
                        formControlName="embedder"
                        [options]="embeddingOptions()"
                        [displayProperty]="'custom_name'"
                        [valueProperty]="'id'"
                        placeholder="Select embedding config"
                        [activeColor]="activeColor"
                        [errorMessage]="getEmbedderError()"
                    ></app-custom-select>

                    <es-duration-picker
                        label="Time To Expire"
                        tooltipText="Optional. Leave blank for no expiration."
                        formControlName="time_to_expired_minutes"
                        [activeColor]="activeColor"
                        [errorMessage]="getTimeToExpiredError()"
                    ></es-duration-picker>
                </form>
            </div>
        </div>
    `,
    styles: [
        `
            @use '../../../styles/node-panel-mixins.scss' as mixins;

            .panel-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 0;
            }

            .panel-content {
                @include mixins.panel-content;
            }

            .form-container {
                @include mixins.form-container;
            }

            .input-map-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 100%;
            }

            .input-map-header {
                display: flex;
                align-items: center;
                gap: 0.5rem;

                label {
                    font-size: 0.875rem;
                    font-weight: 400;
                    color: var(--color-text-primary);
                    margin: 0;
                }
            }

            .input-grid {
                display: grid;
                grid-template-columns: 80px auto 1fr auto;
                gap: 0.5rem;
                align-items: center;
                width: 100%;
            }

            .grid-key {
                input {
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    background-color: var(--color-input-background);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    color: #fff;
                    font-size: 0.875rem;
                    font-family: monospace;
                    text-align: center;
                    opacity: 0.6;
                    cursor: not-allowed;
                    background-color: rgba(255, 255, 255, 0.05);
                }
            }

            .grid-equals {
                color: #fff;
                font-weight: 500;
                text-align: center;
            }

            .grid-value {
                min-width: 0;

                input {
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    background-color: var(--color-input-background);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    color: #fff;
                    font-size: 0.875rem;
                    outline: none;
                    transition: border-color 0.2s ease;

                    &:focus {
                        border-color: var(--active-color);
                    }

                    &::placeholder {
                        color: rgba(255, 255, 255, 0.3);
                    }
                }
            }

            .grid-actions {
                display: flex;
                gap: 4px;
                justify-content: flex-start;
            }

            .grid-spacer {
                height: 0;
            }

            .custom-badge {
                padding: 0.5rem 0.75rem;
                background-color: var(--color-input-background);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: rgba(255, 255, 255, 0.6);
                font-size: 0.875rem;
            }

            .toggle-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: rgba(255, 255, 255, 0.4);
                cursor: pointer;
                transition: all 0.2s;

                &:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: rgba(255, 255, 255, 0.7);
                }

                &.active {
                    background: rgba(255, 152, 0, 0.15);
                    border-color: #ff9800;
                    color: #ff9800;
                }

                i {
                    font-size: 14px;
                }
            }

            .delete-icon {
                font-size: 1rem;
                cursor: pointer;
                color: #ccc;
                padding: 0.2rem;
                border-radius: 4px;
                transition: all 0.2s ease;
                flex-shrink: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;

                &:hover:not(.disabled) {
                    color: red;
                    background-color: rgba(255, 0, 0, 0.1);
                }

                &.disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
            }

            .add-pair-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                background: var(--color-action-btn-background);
                border: 1px solid var(--color-divider-subtle);
                border-radius: 4px;
                color: var(--color-text-primary);
                transition: background-color 0.2s;
                cursor: pointer;
                font-size: 0.875rem;

                &:hover {
                    background: var(--color-action-btn-background-hover);
                }

                i {
                    font-size: 16px;
                }
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebScraperNodePanelComponent extends BaseSidePanel<WebScraperNodeModel> {
    private readonly destroyRef = inject(DestroyRef);
    private readonly embeddingService = inject(FullEmbeddingConfigService);

    embeddingOptions = signal<FullEmbeddingConfig[]>([]);
    urlSourceType = signal<'variable' | 'custom'>('variable');

    constructor() {
        super();

        effect(() => {
            this.embeddingService
                .getFullEmbeddingConfigs()
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((configs) => {
                    this.embeddingOptions.set(configs ?? []);
                });
        });
    }

    get activeColor(): string {
        return this.node().color || '#ff9800';
    }

    get customUrls(): FormArray {
        return this.form.get('custom_urls') as FormArray;
    }

    getUrlControl(index: number): FormControl {
        return this.customUrls.at(index) as FormControl;
    }

    setUrlSourceType(type: 'variable' | 'custom'): void {
        this.urlSourceType.set(type);
    }

    addUrl(): void {
        this.customUrls.push(new FormControl(''));
    }

    removeUrl(index: number): void {
        if (this.customUrls.length > 1) {
            this.customUrls.removeAt(index);
        }
    }

    protected initializeForm(): FormGroup {
        const node = this.node();
        const existingUrls = node.input_map?.['urls'];
        
        let urlsVariable = 'variables.';
        let customUrlsList: string[] = [''];
        let sourceType: 'variable' | 'custom' = 'variable';

        if (existingUrls) {
            if (typeof existingUrls === 'string' && existingUrls.startsWith('variables.')) {
                urlsVariable = existingUrls;
                sourceType = 'variable';
            } else if (Array.isArray(existingUrls)) {
                customUrlsList = existingUrls.length > 0 ? existingUrls : [''];
                sourceType = 'custom';
            } else if (typeof existingUrls === 'string') {
                customUrlsList = [existingUrls];
                sourceType = 'custom';
            }
        }

        this.urlSourceType.set(sourceType);

        const form = this.fb.group({
            node_name: [node.node_name, this.createNodeNameValidators()],
            urls_variable: [urlsVariable],
            custom_urls: this.fb.array(
                customUrlsList.map(url => new FormControl(url))
            ),
            output_variable_path: [node.output_variable_path || ''],
            collection_name: [
                node.data.collection_name || '',
                [Validators.required, Validators.maxLength(255)],
            ],
            embedder: [
                node.data.embedder ?? null,
                [Validators.required],
            ],
            time_to_expired_minutes: new FormControl(
                this.toMinutesField(node.data.time_to_expired),
                [Validators.min(0)]
            ),
        });

        return form;
    }

    protected createUpdatedNode(): WebScraperNodeModel {
        const minutesControlValue = this.form.value.time_to_expired_minutes;
        const time_to_expired = Number(minutesControlValue) || 0;

        let urlsValue: string | string[];
        
        if (this.urlSourceType() === 'variable') {
            const varValue = this.form.value.urls_variable?.trim();
            urlsValue = varValue || 'variables.';
        } else {
            const urls = (this.form.value.custom_urls as string[])
                .map(u => u?.trim())
                .filter(u => u && u.length > 0);
            urlsValue = urls.length > 0 ? urls : [];
        }

        const inputMap: Record<string, any> = {
            urls: urlsValue,
        };

        return {
            ...this.node(),
            node_name: this.form.value.node_name,
            input_map: inputMap,
            output_variable_path: this.form.value.output_variable_path || null,
            data: {
                ...this.node().data,
                collection_name: this.form.value.collection_name?.trim() || '',
                embedder: Number(this.form.value.embedder),
                time_to_expired,
            },
        };
    }

    getCollectionNameError(): string {
        const control = this.form.get('collection_name');
        if (control?.hasError('required')) {
            return 'Collection name is required';
        }
        if (control?.hasError('maxlength')) {
            return 'Max length is 255 characters';
        }
        return '';
    }

    getEmbedderError(): string {
        const control = this.form.get('embedder');
        if (control?.hasError('required')) {
            return 'Select an embedding config';
        }
        return '';
    }

    getTimeToExpiredError(): string {
        const control = this.form.get('time_to_expired_minutes');
        if (!control || control.pristine || control.valid) {
            return '';
        }
        if (control.hasError('min')) {
            return 'Minimum is 1 minute or leave blank for none';
        }
        return '';
    }

    private toMinutesField(timeToExpired: number | undefined | null): number {
        if (timeToExpired === null || timeToExpired === undefined || timeToExpired <= 0) {
            return 0;
        }
        return timeToExpired;
    }
}
