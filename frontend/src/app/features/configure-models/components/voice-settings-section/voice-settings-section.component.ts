import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    ButtonComponent,
    ConfirmationDialogService,
    IconButtonComponent,
    LoadingSpinnerComponent,
} from '@shared/components';
import { GetNgrokConfigResponse } from '@shared/models';
import { NgrokConfigStorageService } from '@shared/services';

import { LoadingState } from '../../../../core/enums/loading-state.enum';
import { ToastService } from '../../../../services/notifications';
import { RealtimeChannel } from '../../../../shared/models/realtime-voice/realtime-channel.model';
import { RealtimeChannelService } from '../../../../shared/services/realtime-channel.service';
import { GetAgentRequest } from '../../../staff/models/agent.model';
import { AgentsService } from '../../../staff/services/staff.service';
import {
    AddEditChannelDialogComponent,
    AddEditChannelDialogData,
} from './add-edit-channel-dialog/add-edit-channel-dialog.component';

@Component({
    selector: 'app-voice-settings-tab',
    templateUrl: './voice-settings-section.component.html',
    styleUrls: ['./voice-settings-section.component.scss'],
    imports: [ButtonComponent, IconButtonComponent, LoadingSpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceSettingsSectionComponent implements OnInit {
    private channelService = inject(RealtimeChannelService);
    private agentsService = inject(AgentsService);
    private ngrokStorage = inject(NgrokConfigStorageService);
    private dialog = inject(Dialog);
    private confirmationDialogService = inject(ConfirmationDialogService);
    private toastService = inject(ToastService);
    private destroyRef = inject(DestroyRef);

    status = signal<LoadingState>(LoadingState.IDLE);

    channels = signal<RealtimeChannel[]>([]);
    private agents = signal<GetAgentRequest[]>([]);
    private ngrokConfigs = signal<GetNgrokConfigResponse[]>([]);

    agentMap = computed<Map<number, string>>(() => new Map(this.agents().map((a) => [a.id, a.role])));

    ngrokMap = computed<Map<number, string>>(
        () =>
            new Map(
                this.ngrokConfigs().map((c) => [
                    c.id,
                    c.webhook_full_url ? c.webhook_full_url.replace(/^https?:\/\//, '').replace(/\/$/, '') : c.name,
                ])
            )
    );

    ngOnInit(): void {
        this.loadAll();
    }

    private loadAll(): void {
        this.status.set(LoadingState.LOADING);

        this.channelService
            .getChannels()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (channels) => {
                    this.channels.set(channels);
                    this.status.set(LoadingState.LOADED);
                },
                error: () => this.status.set(LoadingState.ERROR),
            });

        this.agentsService
            .getAgentsWithRealtimeConfig()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (agents) => this.agents.set(agents), error: () => {} });

        this.ngrokStorage
            .getConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (configs) => this.ngrokConfigs.set(configs), error: () => {} });
    }

    getStreamUrl(channel: RealtimeChannel): string | null {
        const twilio = channel.twilio;
        if (!twilio?.ngrok_config) return null;
        const ngrokDomain = this.ngrokMap().get(twilio.ngrok_config);
        if (!ngrokDomain) return null;
        return `wss://${ngrokDomain}/voice/${channel.token}/stream`;
    }

    onAddChannel(): void {
        const ref = this.dialog.open<boolean, AddEditChannelDialogData>(AddEditChannelDialogComponent, {
            disableClose: true,
            data: { channel: null, action: 'create' },
        });
        ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((saved) => {
            if (saved) this.refreshChannels();
        });
    }

    onEditChannel(channel: RealtimeChannel): void {
        const ref = this.dialog.open<boolean, AddEditChannelDialogData>(AddEditChannelDialogComponent, {
            disableClose: true,
            data: { channel, action: 'update' },
        });
        ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((saved) => {
            if (saved) this.refreshChannels();
        });
    }

    onDeleteChannel(channel: RealtimeChannel): void {
        this.confirmationDialogService
            .confirmDelete(channel.name)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => {
                if (result === true) {
                    this.channelService
                        .deleteChannel(channel.id)
                        .pipe(takeUntilDestroyed(this.destroyRef))
                        .subscribe({
                            next: () => {
                                this.channels.update((chs) => chs.filter((c) => c.id !== channel.id));
                                this.toastService.success(`Channel "${channel.name}" deleted`);
                            },
                            error: () => this.toastService.error('Failed to delete channel'),
                        });
                }
            });
    }

    private refreshChannels(): void {
        this.channelService
            .getChannels()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (channels) => this.channels.set(channels), error: () => {} });
    }
}
