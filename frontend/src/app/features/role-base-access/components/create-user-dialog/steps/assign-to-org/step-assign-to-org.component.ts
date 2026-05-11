import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import {
    AppTableCellDirective,
    AppTableColumnDef,
    AppTableComponent,
    LoadingSpinnerComponent,
    MultiSelectComponent,
    MultiSelectTriggerDirective,
    SearchComponent,
    TableRow,
} from '@shared/components';

import { USER_ROLES } from '../../../../constants/user-roles-select-items.constant';
import { OrgAvatarComponent } from '../../../org-avatar/org-avatar.component';

@Component({
    selector: 'app-step-assign-to-org',
    templateUrl: './step-assign-to-org.component.html',
    styleUrls: ['./step-assign-to-org.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AppTableCellDirective,
        AppTableComponent,
        MultiSelectComponent,
        MultiSelectTriggerDirective,
        SearchComponent,
        OrgAvatarComponent,
        LoadingSpinnerComponent,
    ],
})
export class StepAssignToOrgComponent implements OnInit {
    private destroyRef = inject(DestroyRef);
    // private organizationService = inject(OrganizationService);

    userId = input.required<number>();

    organizationsTableData = signal<TableRow[]>([]);
    searchTerm = signal('');
    isOrgsLoading = signal<boolean>(true);
    selectedOrganizations = signal<TableRow[]>([]);

    filteredOrganizations = computed(() => {
        const term = this.searchTerm().toLowerCase().trim();
        if (!term) return this.organizationsTableData();
        return this.organizationsTableData().filter(
            (row) =>
                (row['name'] as string)?.toLowerCase().includes(term) ||
                (row['email'] as string)?.toLowerCase().includes(term)
        );
    });

    readonly columns: AppTableColumnDef[] = [
        { key: 'organization', label: 'Organization', width: '1fr' },
        { key: 'roles', label: 'System Role', width: '1fr', filterItems: USER_ROLES },
    ];

    ngOnInit() {
        // this.organizationService
        //     .getOrganizationsByUserId(this.userId())
        //     .pipe(
        //         takeUntilDestroyed(this.destroyRef),
        //         map((orgs) =>
        //             orgs.map((org) => ({
        //                 id: org.id,
        //                 name: org.name,
        //             }))
        //         )
        //     )
        //     .subscribe({
        //         next: (orgs) => {
        //             this.organizationsTableData.set(orgs.map((org) => ({ ...org, roles: [] })));
        //             this.isOrgsLoading.set(false);
        //         },
        //         error: () => this.isOrgsLoading.set(false),
        //     });
    }

    onSelection(items: TableRow[]): void {
        this.selectedOrganizations.set(items);
    }

    protected readonly USER_ROLES = USER_ROLES;
}
