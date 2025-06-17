import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatsService } from '../../../services/chats.service';
import { FullAgent } from '../../../../../services/full-agent.service';
import { ConsoleService } from '../../../services/console.service';
import { Dialog } from '@angular/cdk/dialog';
import { RealtimeSettingsDialogComponent } from './realtime-settings-dialog/realtime-settings-dialog.component';

@Component({
  selector: 'app-chats-sidebar-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chats-sidebar-item.component.html',
  styleUrls: ['./chats-sidebar-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatsSidebarItemComponent {
  @Input() agent!: FullAgent;

  public isSelected = computed(
    () => this.chatsService.selectedAgentId$() === this.agent.id
  );

  constructor(
    private chatsService: ChatsService,
    private consoleService: ConsoleService,
    private dialog: Dialog
  ) {}

  public onSelect() {
    this.chatsService.setSelectedAgent(this.agent);
    if (this.consoleService.isConversationConnected()) {
      this.consoleService.disconnectConversation();
    }
  }

  public openSettings(event: Event) {
    event.stopPropagation(); // Prevent triggering onSelect

    const dialogRef = this.dialog.open<FullAgent>(
      RealtimeSettingsDialogComponent,
      {
        data: {
          agent: this.agent,
        },
        width: '100%',
        maxWidth: '550px',
        height: '100%',
        maxHeight: '90vh',
      }
    );

    dialogRef.closed.subscribe((updatedAgent) => {
      if (updatedAgent) {
        console.log('Updated agent received in parent:', updatedAgent);

        // Update the local agent reference with the new data
        this.agent = updatedAgent;

        // If this is the currently selected agent, update it in the service too
        if (this.isSelected()) {
          this.chatsService.setSelectedAgent(updatedAgent);
        }
      }
    });
  }
}
