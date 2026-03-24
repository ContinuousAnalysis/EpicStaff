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
import { Observable, switchMap } from "rxjs";
import { map } from "rxjs/operators";
import { DefaultLlmsCard } from '../../interfaces/default-llms-card.interface';
import { LlmConfigStorageService } from '../../services/llms/llm-config-storage.service';
import { EmbeddingConfigStorageService } from '../../services/llms/embedding-config-storage.service';
import { RealtimeConfigStorageService } from '../../services/llms/realtime-config-storage.service';
import { TranscriptionConfigStorageService } from '../../services/llms/transcription-config-storage.service';
import { ModelTypes } from '@shared/models';
import {
    EmbeddingModelConfigDialogComponent
} from "../embedding-model-config-dialog/embedding-model-config-dialog.component";
import { LlmModelConfigDialogComponent } from "../llm-model-config-dialog/llm-model-config-dialog.component";
import {
    TranscriptionModelConfigDialogComponent
} from "../transcription-model-config-dialog/transcription-model-config-dialog.component";
import { VoiceModelConfigDialogComponent } from "../voice-config-model/voice-model-config-dialog.component";

type DialogComponentType =
    EmbeddingModelConfigDialogComponent |
    LlmModelConfigDialogComponent |
    VoiceModelConfigDialogComponent |
    TranscriptionModelConfigDialogComponent;

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
    private readonly embeddingConfigStorage = inject(EmbeddingConfigStorageService);
    private readonly realtimeConfigStorage = inject(RealtimeConfigStorageService);
    private readonly transcriptionConfigStorage = inject(TranscriptionConfigStorageService);

    private dialog = inject(Dialog);

    public readonly card = input.required<DefaultLlmsCard>();
    public readonly selectedConfigId = input<number | null>(null);
    public readonly modelSelected = output<{ cardId: string; configId: number | null }>();

    selectItems = signal<SelectItem[]>([]);

    private readonly configFetchers: Record<ModelTypes, () => Observable<{ id: number; custom_name: string }[]>> = {
        [ModelTypes.LLM]:           () => this.llmConfigStorageService.getAllConfigs(),
        [ModelTypes.EMBEDDING]:     () => this.embeddingConfigStorage.getAllConfigs(),
        [ModelTypes.REALTIME]:      () => this.realtimeConfigStorage.getAllConfigs(),
        [ModelTypes.TRANSCRIPTION]: () => this.transcriptionConfigStorage.getAllConfigs(),
    };

    private readonly dialogComponents: Record<ModelTypes, ComponentType<DialogComponentType>> = {
        [ModelTypes.LLM]:           LlmModelConfigDialogComponent,
        [ModelTypes.EMBEDDING]:     EmbeddingModelConfigDialogComponent,
        [ModelTypes.REALTIME]:      VoiceModelConfigDialogComponent,
        [ModelTypes.TRANSCRIPTION]: TranscriptionModelConfigDialogComponent,
    };

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

    private getConfigs$(): Observable<{ id: number; custom_name: string }[]> {
        return this.configFetchers[this.card().configType]();
    }

    private getDialogComponent(): ComponentType<DialogComponentType> {
        return this.dialogComponents[this.card().configType];
    }
}
