import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent, CustomInputComponent, SelectComponent, SelectItem } from '@shared/components';

import { LoadingState } from '../../../../core/enums/loading-state.enum';
import { ToastService } from '../../../../services/notifications';
import { GetAgentRequest } from '../../../staff/models/agent.model';
import { AgentsService } from '../../../staff/services/staff.service';
import { GetNgrokConfigResponse } from '../../models/ngrok-config.model';
import { VoiceSettings } from '../../models/voice-settings.model';
import { NgrokConfigApiService } from '../../services/ngrok-config/ngrok-config-api.service';
import { TwilioPhoneNumber, VoiceSettingsService } from '../../services/voice-settings.service';

const PHONE_CACHE_TTL_MS = 60_000;

interface PhoneNumberCache {
    sid: string;
    token: string;
    numbers: TwilioPhoneNumber[];
    loadedAt: number;
}

@Component({
    selector: 'app-voice-settings-tab',
    templateUrl: './voice-settings-tab.component.html',
    styleUrls: ['./voice-settings-tab.component.scss'],
    imports: [ReactiveFormsModule, ButtonComponent, CustomInputComponent, SelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceSettingsTabComponent implements OnInit {
    private voiceSettingsService = inject(VoiceSettingsService);
    private ngrokApiService = inject(NgrokConfigApiService);
    private agentsService = inject(AgentsService);
    private toastService = inject(ToastService);
    private destroyRef = inject(DestroyRef);
    private fb = inject(FormBuilder);

    private phoneCache: PhoneNumberCache | null = null;

    status = signal<LoadingState>(LoadingState.IDLE);
    saving = signal(false);
    configuringWebhook = signal(false);
    loadingPhoneNumbers = signal(false);
    voiceStreamUrl = signal<string | null>(null);

    private agents = signal<GetAgentRequest[]>([]);
    private ngrokConfigs = signal<GetNgrokConfigResponse[]>([]);
    phoneNumbers = signal<TwilioPhoneNumber[]>([]);
    selectedPhoneSid = signal<string | null>(null);

    agentItems = computed<SelectItem[]>(() => this.agents().map((a) => ({ name: a.role, value: a.id })));

    ngrokItems = computed<SelectItem[]>(() =>
        this.ngrokConfigs().map((c) => ({
            name: c.webhook_full_url ? `${c.name} (${c.webhook_full_url})` : c.name,
            value: c.id,
        }))
    );

    phoneNumberItems = computed<SelectItem[]>(() =>
        this.phoneNumbers().map((p) => ({
            name: p.friendly_name ? `${p.friendly_name} (${p.phone_number})` : p.phone_number,
            tip: p.voice_url || 'No webhook configured',
            value: p.sid,
        }))
    );

    canConfigureWebhook = computed(() => !!this.selectedPhoneSid() && !!this.voiceStreamUrl());

    form!: FormGroup;

    ngOnInit(): void {
        this.form = this.fb.group({
            twilio_account_sid: [''],
            twilio_auth_token: [''],
            voice_agent: [null],
            ngrok_config: [null],
        });

        this.form
            .get('ngrok_config')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((id: number | null) => {
                const config = this.ngrokConfigs().find((c) => c.id === Number(id));
                this.voiceStreamUrl.set(this._streamUrlFromConfig(config?.webhook_full_url));
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
            .getAgentsWithRealtimeConfig()
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
                    this.form.patchValue(
                        {
                            twilio_account_sid: vs.twilio_account_sid,
                            twilio_auth_token: vs.twilio_auth_token,
                            voice_agent: vs.voice_agent,
                            ngrok_config: vs.ngrok_config,
                        },
                        { emitEvent: false }
                    );
                    const savedConfig = this.ngrokConfigs().find((c) => c.id === vs.ngrok_config);
                    this.voiceStreamUrl.set(this._streamUrlFromConfig(savedConfig?.webhook_full_url));
                    this.status.set(LoadingState.LOADED);
                },
                error: () => {
                    this.status.set(LoadingState.ERROR);
                },
            });
    }

    onPhoneSelectOpen(): void {
        const sid: string = this.form.get('twilio_account_sid')!.value ?? '';
        const token: string = this.form.get('twilio_auth_token')!.value ?? '';

        if (!sid || !token) {
            this.phoneNumbers.set([]);
            return;
        }

        const now = Date.now();
        const cacheValid =
            this.phoneCache !== null &&
            this.phoneCache.sid === sid &&
            this.phoneCache.token === token &&
            now - this.phoneCache.loadedAt < PHONE_CACHE_TTL_MS;

        if (cacheValid) {
            this.phoneNumbers.set(this.phoneCache!.numbers);
            return;
        }

        this.loadingPhoneNumbers.set(true);
        this.voiceSettingsService
            .getPhoneNumbers()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (numbers) => {
                    this.phoneCache = { sid, token, numbers, loadedAt: Date.now() };
                    this.phoneNumbers.set(numbers);
                    this.loadingPhoneNumbers.set(false);
                },
                error: () => {
                    this.loadingPhoneNumbers.set(false);
                    this.toastService.error('Failed to load Twilio phone numbers');
                },
            });
    }

    private _streamUrlFromConfig(webhookFullUrl?: string | null): string | null {
        if (!webhookFullUrl) return null;
        return webhookFullUrl.replace(/^https?:\/\//, 'wss://').replace(/\/$/, '') + '/voice/stream';
    }

    onSave(): void {
        this.saving.set(true);
        this.voiceSettingsService
            .update(this.form.value)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (vs: VoiceSettings) => {
                    const savedConfig = this.ngrokConfigs().find((c) => c.id === vs.ngrok_config);
                    this.voiceStreamUrl.set(this._streamUrlFromConfig(savedConfig?.webhook_full_url));
                    this.phoneCache = null;
                    this.saving.set(false);
                    this.toastService.success('Voice settings saved');
                },
                error: () => {
                    this.saving.set(false);
                    this.toastService.error('Failed to save voice settings');
                },
            });
    }

    onPhoneNumberChange(sid: string | null): void {
        this.selectedPhoneSid.set(sid);
    }

    onConfigureWebhook(): void {
        const sid = this.selectedPhoneSid();
        if (!sid || this.configuringWebhook()) return;
        this.configuringWebhook.set(true);
        this.voiceSettingsService
            .configureWebhook(sid)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.phoneCache = null;
                    this.configuringWebhook.set(false);
                    this.toastService.success(`Webhook configured: ${res.webhook_url}`);
                },
                error: () => {
                    this.configuringWebhook.set(false);
                    this.toastService.error('Failed to configure webhook');
                },
            });
    }
}
