import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    AppSvgIconComponent,
    AppTableCellDirective,
    AppTableColumnDef,
    AppTableComponent,
    ButtonComponent,
    LoadingSpinnerComponent,
    SearchComponent,
    SelectItem,
    TableRow,
} from '@shared/components';

import { CurrentUserService } from '../../../../../services/auth/current-user.service';
import { CreateUserDialogComponent } from '../../../components/create-user-dialog/create-user-dialog.component';
import { OrgAvatarComponent } from '../../../components/org-avatar/org-avatar.component';
import { StatusBadgeComponent } from '../../../components/status-badge/status-badge.component';
import { UserAvatarComponent } from '../../../components/user-avatar/user-avatar.component';
import { AdminUserService } from '../../../services/admin/admin-user.service';
import { UserService } from '../../../services/users/user.service';
import { NormalizedUser } from '../../../strategies/users/user-fetch.strategy';
import { createUserFetchStrategy } from '../../../strategies/users/user-fetch-strategy.factory';

const STATUS_ITEMS: SelectItem[] = [
    { name: 'Online', value: 'online' },
    { name: 'Invited', value: 'invited' },
    { name: 'Offline', value: 'offline' },
];

const ORG_ITEMS: SelectItem[] = [
    { name: 'EpicStaff', value: 1 },
    { name: 'EpicFlow', value: 2 },
    { name: 'MYM', value: 3 },
];

@Component({
    selector: 'app-users-tab',
    templateUrl: './users-tab.component.html',
    styleUrls: ['./users-tab.component.scss'],
    imports: [
        AppTableComponent,
        AppTableCellDirective,
        AppSvgIconComponent,
        ButtonComponent,
        SearchComponent,
        LoadingSpinnerComponent,
        StatusBadgeComponent,
        UserAvatarComponent,
        OrgAvatarComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersTabComponent implements OnInit {
    private dialog = inject(Dialog);
    private destroyRef = inject(DestroyRef);
    private userService = inject(UserService);
    private adminUserService = inject(AdminUserService);
    private currentUserService = inject(CurrentUserService);

    usersData = signal<TableRow[]>([]);
    searchTerm = signal('');
    isLoading = signal(true);

    filteredUsers = computed(() => {
        const term = this.searchTerm().toLowerCase().trim();
        if (!term) return this.usersData();
        return this.usersData().filter((row) => (row['name'] as string)?.toLowerCase().includes(term));
    });

    columns: AppTableColumnDef[] = [
        { key: 'user', label: 'USER', width: '1fr' },
        { key: 'roles', label: 'SYSTEM ROLE', width: '1fr' },
        { key: 'organization', label: 'ORGANIZATION', width: '1fr', filterItems: ORG_ITEMS },
        { key: 'lastActive', label: 'LAST ACTIVE', width: '160px' },
        { key: 'status', label: 'STATUS', width: '160px', filterItems: STATUS_ITEMS },
        { key: 'actions', label: 'ACTIONS', width: '120px', align: 'center' },
    ];

    ngOnInit(): void {
        const strategy = createUserFetchStrategy(this.currentUserService, this.adminUserService, this.userService);

        strategy
            .fetchUsers()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (users) => {
                    this.usersData.set(users.map((u) => this.mapToRow(u)));
                    this.isLoading.set(false);
                },
                error: () => this.isLoading.set(false),
            });
    }

    formatDate(date: unknown): string {
        if (!(date instanceof Date)) return '';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    getRelativeTime(date: unknown): string {
        if (!(date instanceof Date)) return '';
        const diffMs = Date.now() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins} m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 30) return `${diffDays} d ago`;
        return `${Math.floor(diffDays / 30)} m ago`;
    }

    statusLabel(status: string): string {
        const labels: Record<string, string> = { online: 'Online', invited: 'Invited', offline: 'Offline' };
        return labels[status] ?? status;
    }

    onCreateUser(): void {
        this.dialog.open(CreateUserDialogComponent, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
            disableClose: true,
        });
    }

    private mapToRow(user: NormalizedUser): TableRow {
        const orgs = user.memberships.map((m) => m.organization);
        const roles = user.memberships.map((m) => m.role.name);

        return {
            id: user.id,
            name: user.displayName,
            email: user.email,
            roles: roles.join(', '),
            organization: orgs,
            lastActive: null,
            status: user.isActive ? 'online' : 'offline',
        };
    }
}
