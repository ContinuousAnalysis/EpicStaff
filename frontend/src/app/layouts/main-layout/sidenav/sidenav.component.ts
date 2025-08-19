import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ICONS } from '../../../shared/constants/icons.constants';
import { SettingsDialogService } from '../../../features/settings-dialog/settings-dialog.service';
import { ThemeService } from '../../../services/theme/theme.service';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

interface NavItem {
    id: string;
    routeLink?: string;
    icon: string;
    label: string;
    action?: () => void;
    customClass?: string;
}

@Component({
    selector: 'app-left-sidebar',
    standalone: true,
    imports: [ButtonModule, TooltipModule, RouterModule],
    templateUrl: './sidenav.component.html',
    styleUrls: ['./sidenav.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeftSidebarComponent {
    public topNavItems: NavItem[];
    public bottomNavItems: NavItem[];

    constructor(
        private settingsDialogService: SettingsDialogService,
        private router: Router,
        public themeService: ThemeService
    ) {
        this.topNavItems = [
            {
                id: 'projects',
                routeLink: 'projects',
                icon: ICONS.projects,
                label: 'Projects',
            },
            {
                id: 'staff',
                routeLink: 'staff',
                icon: ICONS.staff,
                label: 'Staff',
            },
            {
                id: 'tools',
                routeLink: 'tools',
                icon: ICONS.tools,
                label: 'Tools',
            },
            {
                id: 'flows',
                routeLink: 'flows',
                icon: ICONS.flows,
                label: 'Flows',
            },
            {
                id: 'knowledge-sources',
                routeLink: 'knowledge-sources',
                icon: ICONS.sources,
                label: 'Knowledge Sources',
            },
            {
                id: 'chats',
                routeLink: 'chats',
                icon: ICONS.chats,
                label: 'Chats',
            },
        ];

        this.bottomNavItems = [
            {
                id: 'theme-toggle',
                icon: ICONS.darkMode,
                label: 'Toggle Theme',
                action: () => this.toggleTheme(),
                customClass: 'theme-toggle-tooltip',
            },
            {
                id: 'settings',
                icon: ICONS.settings,
                label: 'Settings',
                action: () => this.onSettingsClick(),
                customClass: 'settings-tooltip',
            },
        ];
    }

    private onSettingsClick(): void {
        this.settingsDialogService.openSettingsDialog();
    }

    public toggleTheme(): void {
        this.themeService.toggleTheme();
    }

    public getThemeIcon(): string {
        return this.themeService.getCurrentTheme()
            ? ICONS.lightMode
            : ICONS.darkMode;
    }

    public handleItemClick(item: NavItem, event: Event): void {
        if (item.action) {
            event.preventDefault();
            item.action();
        }
    }

    public navigateToHome(): void {
        this.router.navigate(['/projects']);
    }

    public isActiveRoute(route: string): boolean {
        return this.router.url.includes(route);
    }
}
