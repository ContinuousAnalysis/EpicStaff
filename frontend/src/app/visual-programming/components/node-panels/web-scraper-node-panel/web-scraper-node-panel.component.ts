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
import { FullEmbeddingConfig, FullEmbeddingConfigService } from '../../../../services/full-embedding.service';

const MAX_EXPIRATION_MINUTES = 10080; // 7 days

@Component({
    standalone: true,
    selector: 'app-web-scraper-node-panel',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CustomInputComponent,
        CustomSelectComponent,
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

                    <app-custom-input
                        label="Time To Expire (minutes)"
                        tooltipText="Optional. Leave blank for no expiration. Max 7 days."
                        formControlName="time_to_expired_minutes"
                        placeholder="e.g. 60"
                        type="number"
                        [activeColor]="activeColor"
                        [errorMessage]="getTimeToExpiredError()"
                    ></app-custom-input>
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

    protected initializeForm(): FormGroup {
        return this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
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
                [Validators.min(1), Validators.max(MAX_EXPIRATION_MINUTES)]
            ),
        });
    }

    protected createUpdatedNode(): WebScraperNodeModel {
        const minutesControlValue = this.form.value.time_to_expired_minutes;
        const time_to_expired =
            minutesControlValue === null ||
            minutesControlValue === undefined ||
            minutesControlValue === ''
                ? -1
                : Number(minutesControlValue);

        return {
            ...this.node(),
            node_name: this.form.value.node_name,
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
        if (control.hasError('max')) {
            return `Maximum is ${MAX_EXPIRATION_MINUTES} minutes`;
        }
        return '';
    }

    private toMinutesField(timeToExpired: number | undefined | null): number | null {
        if (timeToExpired === null || timeToExpired === undefined) {
            return null;
        }
        if (timeToExpired <= 0) {
            return null;
        }
        return timeToExpired;
    }
}

