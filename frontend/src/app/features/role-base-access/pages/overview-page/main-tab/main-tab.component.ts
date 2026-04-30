import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppSvgIconComponent, ButtonComponent, LoadingSpinnerComponent } from '@shared/components';
import { finalize } from 'rxjs';

import { CreateOrganizationDialogComponent } from '../../../components/create-organization-dialog/create-organization-dialog.component';
import { OrgCardComponent } from '../../../components/org-card/org-card.component';
import { StatCardComponent } from '../../../components/stat-card/stat-card.component';
import { StatCardData } from '../../../components/stat-card/stat-card.interface';
import { OrganizationsStorageService } from '../../../services/admin/organizations-storage.service';

@Component({
    selector: 'app-workspace-main',
    imports: [StatCardComponent, ButtonComponent, OrgCardComponent, AppSvgIconComponent, LoadingSpinnerComponent],
    templateUrl: './main-tab.component.html',
    styleUrls: ['./main-tab.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainTabComponent implements OnInit {
    private readonly dialog = inject(Dialog);
    private readonly destroyRef = inject(DestroyRef);
    private readonly organizationStorage = inject(OrganizationsStorageService);

    public organizations = this.organizationStorage.organizations;
    public isOrgsLoading = signal(true);

    public stats = computed<StatCardData[]>(() => [
        {
            label: 'TOTAL ORGANIZATIONS',
            icon: 'buildings',
            value: this.organizations().length,
        },
        {
            label: 'TOTAL USERS',
            icon: 'profile',
            value: 1,
        },
    ]);

    ngOnInit(): void {
        this.getOrganizations();
    }

    private getOrganizations(): void {
        this.organizationStorage
            .getOrganizations()
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isOrgsLoading.set(false))
            )
            .subscribe();
    }

    onCreateOrganization(): void {
        this.dialog.open(CreateOrganizationDialogComponent, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
            disableClose: true,
        });
    }
}
