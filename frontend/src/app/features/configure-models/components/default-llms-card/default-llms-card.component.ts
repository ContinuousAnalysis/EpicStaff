import { Dialog } from "@angular/cdk/dialog";
import { ComponentType } from "@angular/cdk/portal";
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    input, OnInit,
    output,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AppIconComponent, SelectComponent, SelectItem } from '@shared/components';
import { EmbeddingConfigsService, RealtimeModelConfigsService } from "@shared/services";
import { Observable, switchMap } from "rxjs";
import { map } from "rxjs/operators";
import { GetTranscriptionConfigRequest } from "../../../transcription/models/transcription-config.model";
import { TranscriptionConfigsService } from "../../../transcription/services/transcription-config.service";
import { DefaultLlmsCard } from '../../interfaces/default-llms-card.interface';
import { LlmConfigStorageService } from '../../services/llms/llm-config-storage.service';
import { EmbeddingConfig, GetLlmConfigRequest, ModelTypes, RealtimeModelConfig } from '@shared/models';
import {
    EmbeddingModelConfigDialogComponent
} from "../embedding-model-config-dialog/embedding-model-config-dialog.component";
import { LlmModelConfigDialogComponent } from "../llm-model-config-dialog/llm-model-config-dialog.component";
import {
    TranscriptionModelConfigDialogComponent
} from "../transcription-model-config-dialog/transcription-model-config-dialog.component";
import { VoiceModelConfigDialogComponent } from "../voice-config-model/voice-model-config-dialog.component";

@Component({
    selector: 'app-default-llms-card',
    imports: [CommonModule, AppIconComponent, SelectComponent],
    templateUrl: './default-llms-card.component.html',
    styleUrls: ['./default-llms-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultLlmsCardComponent implements OnInit {
    private readonly destroyRef = inject(DestroyRef);
    private readonly llmConfigStorageService = inject(LlmConfigStorageService);
    private readonly realtimeConfigService = inject(RealtimeModelConfigsService);
    private readonly transcriptionConfigsService = inject(TranscriptionConfigsService);
    private readonly embeddingConfigsService = inject(EmbeddingConfigsService);

    private dialog = inject(Dialog);

    public readonly card = input.required<DefaultLlmsCard>();
    public readonly selectedConfigId = input<number | null>(null);
    public readonly modelSelected = output<{ cardId: string; configId: number | null }>();

    selectItems = signal<SelectItem[]>([]);

    ngOnInit() {
        this.getConfigs$()
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                map((items): SelectItem[] =>
                    items.map(item => ({
                        value: item.id,
                        name: item.custom_name,
                    }))
                )
            )
            .subscribe(items => this.selectItems.set(items));
    }

    public selectConfig(configId: number): void {
        this.modelSelected.emit({ cardId: this.card().id, configId: configId });
    }

    public onResetConfig(): void {
        this.modelSelected.emit({ cardId: this.card().id, configId: null });
    }

    public onAddModel(): void {
        const component = this.getDialogComponent();
        const dialogRef = this.dialog.open(component, {
            height: '90vh',
            width: '600px',
        });

        dialogRef.closed
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                switchMap(() => this.getConfigs$())
            )
            .subscribe();
    }

    private getConfigs$(): Observable<EmbeddingConfig[] | GetTranscriptionConfigRequest[] | RealtimeModelConfig[] | GetLlmConfigRequest[]> {
        switch (this.card().configType) {
            case ModelTypes.EMBEDDING:
                return this.embeddingConfigsService.getEmbeddingConfigs();
            case ModelTypes.REALTIME:
                return this.transcriptionConfigsService.getTranscriptionConfigs();
            case ModelTypes.TRANSCRIPTION:
                return this.realtimeConfigService.getAllConfigs();
            case ModelTypes.LLM:
                return this.llmConfigStorageService.getAllConfigs();
            default:
                return this.llmConfigStorageService.getAllConfigs();
        }
    }

    private getDialogComponent(): ComponentType<
        EmbeddingModelConfigDialogComponent |
        LlmModelConfigDialogComponent |
        VoiceModelConfigDialogComponent |
        TranscriptionModelConfigDialogComponent
    > {
        switch (this.card().configType) {
            case ModelTypes.EMBEDDING:
                return EmbeddingModelConfigDialogComponent;
            case ModelTypes.REALTIME:
                return VoiceModelConfigDialogComponent;
            case ModelTypes.TRANSCRIPTION:
                return TranscriptionModelConfigDialogComponent;
            case ModelTypes.LLM:
                return LlmModelConfigDialogComponent;
            default:
                return LlmModelConfigDialogComponent;
        }
    }
}
