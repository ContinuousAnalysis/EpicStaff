import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent } from '@shared/components';
import { LoadingState } from '../../../../core/enums/loading-state.enum';
import { ToastService } from '../../../../services/notifications';
import { GetNgrokConfigResponse } from '../../models/ngrok-config.model';
import { VoiceSettings } from '../../models/voice-settings.model';
import { NgrokConfigApiService } from '../../services/ngrok-config/ngrok-config-api.service';
import { VoiceSettingsService } from '../../services/voice-settings.service';
import { GetAgentRequest } from '../../../staff/models/agent.model';
import { AgentsService } from '../../../staff/services/staff.service';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-voice-settings-tab',
    templateUrl: './voice-settings-tab.component.html',
    styleUrls: ['./voice-settings-tab.component.scss'],
    imports: [ReactiveFormsModule, ButtonComponent, CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceSettingsTabComponent implements OnInit {
    private voiceSettingsService = inject(VoiceSettingsService);
    private ngrokApiService = inject(NgrokConfigApiService);
    private agentsService = inject(AgentsService);
    private toastService = inject(ToastService);
    private destroyRef = inject(DestroyRef);
    private fb = inject(FormBuilder);

    status = signal<LoadingState>(LoadingState.IDLE);
    saving = signal(false);
    agents = signal<GetAgentRequest[]>([]);
    ngrokConfigs = signal<GetNgrokConfigResponse[]>([]);
    voiceStreamUrl = signal<string | null>(null);

    form!: FormGroup;

    ngOnInit(): void {
        this.form = this.fb.group({
            twilio_account_sid: [''],
            twilio_auth_token: [''],
            voice_agent: [null],
            ngrok_config: [null],
        });

        this.form.get('ngrok_config')!.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((id: number | null) => {
                const config = this.ngrokConfigs().find((c) => c.id === Number(id));
                this.voiceStreamUrl.set(
                    config?.domain ? `wss://${config.domain}/voice/stream` : null
                );
            });

        this.loadAll();
    }

    private loadAll(): void {
        this.status.set(LoadingState.LOADING);

        this.ngrokApiService
            .getNgrokConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (configs) => this.ngrokConfigs.set(configs),
                error: () => {},
            });

        this.agentsService
            .getAgents()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (agents) => this.agents.set(agents),
                error: () => {},
            });

        this.voiceSettingsService
            .get()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (vs: VoiceSettings) => {
                    this.form.patchValue({
                        twilio_account_sid: vs.twilio_account_sid,
                        twilio_auth_token: vs.twilio_auth_token,
                        voice_agent: vs.voice_agent,
                        ngrok_config: vs.ngrok_config,
                    });
                    this.voiceStreamUrl.set(vs.voice_stream_url);
                    this.status.set(LoadingState.LOADED);
                },
                error: () => {
                    this.status.set(LoadingState.ERROR);
                },
            });
    }

    onSave(): void {
        this.saving.set(true);
        this.voiceSettingsService
            .update(this.form.value)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (vs: VoiceSettings) => {
                    this.voiceStreamUrl.set(vs.voice_stream_url);
                    this.saving.set(false);
                    this.toastService.success('Voice settings saved');
                },
                error: () => {
                    this.saving.set(false);
                    this.toastService.error('Failed to save voice settings');
                },
            });
    }
}
