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
import { InputMapComponent } from '../../input-map/input-map.component';
import { FullEmbeddingConfig, FullEmbeddingConfigService } from '../../../../services/full-embedding.service';

interface InputMapPair {
    key: string;
    value: string;
}

@Component({
    standalone: true,
    selector: 'app-web-scraper-node-panel',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CustomInputComponent,
        CustomSelectComponent,
        EsDurationPickerComponent,
        InputMapComponent,
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

                    <div class="input-map">
                        <app-input-map
                            [activeColor]="activeColor"
                        ></app-input-map>
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

            .form-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebScraperNodePanelComponent extends BaseSidePanel<WebScraperNodeModel> {
    private readonly destroyRef = inject(DestroyRef);
    private readonly embeddingService = inject(FullEmbeddingConfigService);

    embeddingOptions = signal<FullEmbeddingConfig[]>([]);

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

    get inputMapPairs(): FormArray {
        return this.form.get('input_map') as FormArray;
    }

    protected initializeForm(): FormGroup {
        const form = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
            input_map: this.fb.array([]),
            output_variable_path: [this.node().output_variable_path || ''],
            collection_name: [
                this.node().data.collection_name || '',
                [Validators.required, Validators.maxLength(255)],
            ],
            embedder: [
                this.node().data.embedder ?? null,
                [Validators.required],
            ],
            time_to_expired_minutes: new FormControl(
                this.toMinutesField(this.node().data.time_to_expired),
                [Validators.min(0)]
            ),
        });

        this.initializeInputMap(form);
        return form;
    }

    protected createUpdatedNode(): WebScraperNodeModel {
        console.log('[WebScraperNodePanel] createUpdatedNode called');
        console.log('[WebScraperNodePanel] Form value:', this.form.value);
        
        const minutesControlValue = this.form.value.time_to_expired_minutes;
        const time_to_expired = Number(minutesControlValue) || 0;

        const validInputPairs = this.getValidInputPairs();
        const inputMapValue = this.createInputMapFromPairs(validInputPairs);

        const updatedNode = {
            ...this.node(),
            node_name: this.form.value.node_name,
            input_map: inputMapValue,
            output_variable_path: this.form.value.output_variable_path || null,
            data: {
                ...this.node().data,
                collection_name: this.form.value.collection_name?.trim() || '',
                embedder: Number(this.form.value.embedder),
                time_to_expired,
            },
        };
        
        console.log('[WebScraperNodePanel] Created node:', updatedNode);
        return updatedNode;
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

    private initializeInputMap(form: FormGroup): void {
        const inputMapArray = form.get('input_map') as FormArray;

        if (
            this.node().input_map &&
            Object.keys(this.node().input_map).length > 0
        ) {
            Object.entries(this.node().input_map).forEach(([key, value]) => {
                inputMapArray.push(
                    this.fb.group({
                        key: [key, Validators.required],
                        value: [value, Validators.required],
                    })
                );
            });
        } else {
            inputMapArray.push(
                this.fb.group({
                    key: [''],
                    value: ['variables.'],
                })
            );
        }
    }

    private getValidInputPairs(): any[] {
        return this.inputMapPairs.controls.filter((control) => {
            const value = control.value;
            return value.key?.trim() !== '' || value.value?.trim() !== '';
        });
    }

    private createInputMapFromPairs(pairs: any[]): Record<string, string> {
        return pairs.reduce((acc: Record<string, string>, curr: any) => {
            const pair = curr.value as InputMapPair;
            if (pair.key?.trim()) {
                acc[pair.key.trim()] = pair.value;
            }
            return acc;
        }, {});
    }
}

