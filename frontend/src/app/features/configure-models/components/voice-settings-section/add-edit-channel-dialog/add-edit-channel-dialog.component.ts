import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent, CustomInputComponent, SelectComponent, SelectItem } from '@shared/components';
import { GetNgrokConfigResponse } from '@shared/models';
import { NgrokConfigStorageService } from '@shared/services';

import { RealtimeChannel, TwilioChannel } from '../../../../../shared/models/realtime-voice/realtime-channel.model';
import { RealtimeChannelService } from '../../../../../shared/services/realtime-channel.service';
import { GetAgentRequest } from '../../../../staff/models/agent.model';
import { AgentsService } from '../../../../staff/services/staff.service';

export interface AddEditChannelDialogData {
    channel: RealtimeChannel | null;
    action: 'create' | 'update';
}

@Component({
    selector: 'app-add-edit-channel-dialog',
    templateUrl: './add-edit-channel-dialog.component.html',
    styleUrls: ['./add-edit-channel-dialog.component.scss'],
    imports: [ReactiveFormsModule, CustomInputComponent, SelectComponent, ButtonComponent, NgIf],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddEditChannelDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private dialogRef = inject(DialogRef);
    private channelService = inject(RealtimeChannelService);
    private agentsService = inject(AgentsService);
    private ngrokStorage = inject(NgrokConfigStorageService);
    private destroyRef = inject(DestroyRef);

    data: AddEditChannelDialogData = inject(DIALOG_DATA);

    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);

    private agents = signal<GetAgentRequest[]>([]);
    private ngrokConfigs = signal<GetNgrokConfigResponse[]>([]);

    agentItems = computed<SelectItem[]>(() => [
        { name: '— None —', value: null },
        ...this.agents().map((a) => ({ name: a.role, value: a.id })),
    ]);

    ngrokItems = computed<SelectItem[]>(() => [
        { name: '— None —', value: null },
        ...this.ngrokConfigs().map((c) => ({
            name: c.webhook_full_url ? `${c.name} (${c.webhook_full_url})` : c.name,
            value: c.id,
        })),
    ]);

    form!: FormGroup;

    ngOnInit(): void {
        const ch = this.data.channel;
        const tw = ch?.twilio;

        this.form = this.fb.group({
            name: [ch?.name ?? '', Validators.required],
            realtime_agent: [ch?.realtime_agent ?? null],
            is_active: [ch?.is_active ?? true],
            account_sid: [tw?.account_sid ?? ''],
            auth_token: [tw?.auth_token ?? ''],
            phone_number: [tw?.phone_number ?? ''],
            ngrok_config: [tw?.ngrok_config ?? null],
        });

        this.agentsService
            .getAgentsWithRealtimeConfig()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (agents) => this.agents.set(agents), error: () => {} });

        this.ngrokStorage
            .getConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (configs) => this.ngrokConfigs.set(configs), error: () => {} });

        this.dialogRef.keydownEvents.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
                event.preventDefault();
                this.onSubmit();
            }
        });
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        this.isSubmitting.set(true);
        this.errorMessage.set(null);

        const v = this.form.value;
        if (this.data.action === 'create') {
            this.channelService
                .createChannel({
                    name: v.name,
                    channel_type: 'twilio',
                    realtime_agent: v.realtime_agent ?? null,
                    is_active: v.is_active,
                })
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: (channel) =>
                        this.saveTwilioChannel(
                            channel.id,
                            v.account_sid,
                            v.auth_token,
                            v.phone_number,
                            v.ngrok_config,
                            null
                        ),
                    error: () => {
                        this.errorMessage.set('Failed to create channel.');
                        this.isSubmitting.set(false);
                    },
                });
        } else {
            const ch = this.data.channel!;
            this.channelService
                .updateChannel({
                    id: ch.id,
                    name: v.name,
                    realtime_agent: v.realtime_agent ?? null,
                    is_active: v.is_active,
                })
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: () =>
                        this.saveTwilioChannel(
                            ch.id,
                            v.account_sid,
                            v.auth_token,
                            v.phone_number,
                            v.ngrok_config,
                            ch.twilio ?? null
                        ),
                    error: () => {
                        this.errorMessage.set('Failed to update channel.');
                        this.isSubmitting.set(false);
                    },
                });
        }
    }

    private saveTwilioChannel(
        channelId: number,
        accountSid: string,
        authToken: string,
        phoneNumber: string,
        ngrokConfig: number | null,
        existingTwilio: TwilioChannel | null
    ): void {
        const hasTwilioData = accountSid || authToken || phoneNumber;

        if (!hasTwilioData) {
            this.dialogRef.close(true);
            return;
        }

        const obs = existingTwilio
            ? this.channelService.updateTwilioChannel({
                  id: existingTwilio.id,
                  account_sid: accountSid,
                  auth_token: authToken,
                  phone_number: phoneNumber || null,
                  ngrok_config: ngrokConfig,
              })
            : this.channelService.createTwilioChannel({
                  channel: channelId,
                  account_sid: accountSid,
                  auth_token: authToken,
                  phone_number: phoneNumber || null,
                  ngrok_config: ngrokConfig,
              });

        obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => this.dialogRef.close(true),
            error: () => {
                this.errorMessage.set('Channel saved but Twilio settings failed to save.');
                this.isSubmitting.set(false);
            },
        });
    }

    onCancel(): void {
        this.dialogRef.close(null);
    }
}
