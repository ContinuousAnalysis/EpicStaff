import {
    Component,
    ChangeDetectionStrategy,
    CUSTOM_ELEMENTS_SCHEMA,
    ElementRef,
    ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ICONS } from '../../../shared/constants/icons.constants';
import { TooltipComponent } from './tooltip/tooltip.component';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SettingsDialogService } from '../../../features/settings-dialog/settings-dialog.service';
import { OverlayModule } from '@angular/cdk/overlay';
import { PortalModule } from '@angular/cdk/portal';
import { EpicChatService } from '../../../features/epic-chat/epic-chat.service';
import { ConfigService } from '../../../services/config/config.service';

interface NavItem {
    id: string;
    routeLink?: string;
    svgIcon: SafeHtml;
    label: string;
    showTooltip: boolean;
    action?: () => void;
    customClass?: string;
}

@Component({
    selector: 'app-left-sidebar',
    standalone: true,
    imports: [
        TooltipComponent,
        RouterLinkActive,
        RouterLink,
        OverlayModule,
        PortalModule,
    ],
    templateUrl: './sidenav.component.html',
    styleUrls: ['./sidenav.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class LeftSidebarComponent {
    public topNavItems: NavItem[];
    public bottomNavItems: NavItem[];
    public isEpicChatEnabled: boolean;
    @ViewChild('epicChat', { static: false })
    private epicChat?: ElementRef<HTMLElement>;

    constructor(
        private sanitizer: DomSanitizer,
        private epicChatService: EpicChatService,
        private settingsDialogService: SettingsDialogService,
        private configService: ConfigService
    ) {
        this.isEpicChatEnabled = this.configService.isEpicChatEnabled;
        this.topNavItems = [
            {
                id: 'projects',
                routeLink: 'projects',
                svgIcon: this.sanitizer.bypassSecurityTrustHtml(ICONS.projects),
                label: 'Projects',
                showTooltip: false,
            },
            {
                id: 'staff',
                routeLink: 'staff',
                svgIcon: this.sanitizer.bypassSecurityTrustHtml(ICONS.staff),
                label: 'Staff',
                showTooltip: false,
            },
            {
                id: 'tools',
                routeLink: 'tools',
                svgIcon: this.sanitizer.bypassSecurityTrustHtml(ICONS.tools),
                label: 'Tools',
                showTooltip: false,
            },
            {
                id: 'flows',
                routeLink: 'flows',
                svgIcon: this.sanitizer.bypassSecurityTrustHtml(ICONS.flows),
                label: 'Flows',
                showTooltip: false,
            },
            {
                id: 'knowledge-sources',
                routeLink: 'knowledge-sources',
                svgIcon: this.sanitizer.bypassSecurityTrustHtml(ICONS.sources),
                label: 'Knowledge Sources',
                showTooltip: false,
            },
            {
                id: 'chats',
                routeLink: 'chats',
                svgIcon: this.sanitizer.bypassSecurityTrustHtml(ICONS.chats),
                label: 'Chats',
                showTooltip: false,
            },
        ];

        this.bottomNavItems = [];
        if (this.isEpicChatEnabled) {
            this.bottomNavItems.push({
                id: 'epic-chat',
                svgIcon: this.sanitizer.bypassSecurityTrustHtml(ICONS.chats),
                label: 'Epic Chat',
                showTooltip: false,
                action: () => this.toggleEpicChat(),
            });
        }
        this.bottomNavItems.push({
            id: 'settings',
            svgIcon: this.sanitizer.bypassSecurityTrustHtml(ICONS.settings),
            label: 'Settings',
            showTooltip: false,
            action: () => this.onSettingsClick(),
            customClass: 'settings-tooltip',
        });
    }

    private onSettingsClick(): void {
        this.settingsDialogService.openSettingsDialog();
    }

    public toggleEpicChat(): void {
        this.epicChatService.toggleChat(this.epicChat?.nativeElement);
    }

    public handleItemClick(item: NavItem, event: MouseEvent): void {
        if (item.action) {
            event.preventDefault();
            item.action();
        }
    }
}
