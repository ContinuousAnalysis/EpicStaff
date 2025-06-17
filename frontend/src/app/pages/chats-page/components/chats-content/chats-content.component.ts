import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ConsoleService } from '../../services/console.service';
import { ChatsService } from '../../services/chats.service';
import { ChatComponent } from './chat/chat.component';

@Component({
  selector: 'app-chats-content',
  standalone: true,
  imports: [NgIf, RouterModule, ChatComponent],
  templateUrl: './chats-content.component.html',
  styleUrls: ['./chats-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatsContentComponent {
  constructor(
    public consoleService: ConsoleService,
    public chatsService: ChatsService
  ) {}

  public get selectedAgent() {
    return this.chatsService.selectedAgent$();
  }

  ngOnDestroy() {}
}
