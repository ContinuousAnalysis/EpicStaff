import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
    viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonComponent, LoadingSpinnerComponent } from '@shared/components';
import { FullMembership, GetOrganizationResponse } from '@shared/models';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { ProfileService } from '../../../../services/auth/profile.service';
import { ToastService } from '../../../../services/notifications';
import { AdminUserService } from '../../services/admin/admin-user.service';
import { OrganizationsStorageService } from '../../services/admin/organizations-storage.service';
import { UserService } from '../../services/users/user.service';
import { NormalizedUser } from '../../strategies/users/user-fetch.strategy';
import { OrgAssignment, StepAssignToOrgComponent } from './steps/assign-to-org/step-assign-to-org.component';
import { StepUserDetailsComponent } from './steps/user-details/step-user-details.component';

export interface UserDialogData {
    user?: NormalizedUser;
}

@Component({
    selector: 'app-create-user-dialog',
    templateUrl: './create-user-dialog.component.html',
    styleUrls: ['./create-user-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ButtonComponent, StepUserDetailsComponent, StepAssignToOrgComponent, LoadingSpinnerComponent],
})
export class CreateUserDialogComponent implements OnInit {
    private destroyRef = inject(DestroyRef);
    private dialogRef = inject(DialogRef);
    private dialogData = inject<UserDialogData>(DIALOG_DATA, { optional: true });
    private currentUserService = inject(ProfileService);
    private adminUserService = inject(AdminUserService);
    private userService = inject(UserService);
    private organizationsStorage = inject(OrganizationsStorageService);
    private toast = inject(ToastService);

    private readonly userDetailsStep = viewChild(StepUserDetailsComponent);
    private readonly assignToOrgStep = viewChild(StepAssignToOrgComponent);

    readonly isSuperAdmin = this.currentUserService.isMeSuperAdmin;
    readonly editUser = signal<NormalizedUser | null>(this.dialogData?.user ?? null);
    readonly availableOrganizations = signal<GetOrganizationResponse[]>([]);
    readonly isSubmitting = signal<boolean>(false);
    readonly loadingOrganizations = signal<boolean>(true);

    readonly editMode = computed(() => this.editUser() !== null);
    readonly existingMemberships = computed<FullMembership[]>(() => this.editUser()?.memberships ?? []);
    readonly submitDisabled = computed(() => !(this.userDetailsStep()?.isFormValid() ?? false) || this.isSubmitting());

    ngOnInit(): void {
        this.loadOrganizations();
    }

    onClose(): void {
        this.dialogRef.close();
    }

    onSubmit(): void {
        const detailsStep = this.userDetailsStep();
        if (!detailsStep || !detailsStep.isFormValid()) return;

        this.isSubmitting.set(true);

        const { email, password, superadmin } = detailsStep.form.getRawValue();

        this.createOrGetUserId(email!, password!, superadmin ?? false)
            .pipe(
                switchMap((userId) => {
                    if (!userId) return of(false);
                    const assignments = this.assignToOrgStep()?.getAssignments() ?? [];
                    const removals = this.computeOrgRemovals(userId, assignments);
                    return this.batchAssignToOrgs(userId, assignments).pipe(
                        switchMap(() => this.batchRemoveFromOrgs(removals)),
                        switchMap(() => this.handleSuperadminToggle(userId, superadmin ?? false))
                    );
                }),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: (success) => {
                    this.isSubmitting.set(false);
                    if (!success) return;
                    this.toast.success(this.editMode() ? 'User updated successfully.' : 'User created successfully.');
                    this.dialogRef.close(true);
                },
                error: (err: HttpErrorResponse) => {
                    this.isSubmitting.set(false);
                    this.toast.error(err.error?.message ?? 'Operation failed');
                },
            });
    }

    private createOrGetUserId(email: string, password: string, superadmin: boolean): Observable<number | null> {
        if (this.editMode()) {
            return of(this.editUser()!.id);
        }

        if (this.isSuperAdmin()) {
            return this.adminUserService.createUser({ email, password }).pipe(
                switchMap((user) => {
                    if (superadmin) {
                        return this.adminUserService.grantSuperadmin(user.id).pipe(map(() => user.id));
                    }
                    return of(user.id);
                }),
                catchError((err: HttpErrorResponse) => {
                    this.toast.error(err.error?.message ?? 'Failed to create user');
                    return of(null);
                })
            );
        }

        const currentUser = this.currentUserService.currentUserSignal()!;
        const firstOrg = currentUser.memberships[0];
        if (!firstOrg) return of(null);

        return this.userService
            .createUser(firstOrg.organization.id, { email, password, role_id: firstOrg.role.id })
            .pipe(
                map((user) => user.id),
                catchError((err: HttpErrorResponse) => {
                    this.toast.error(err.error?.message ?? 'Failed to create user');
                    return of(null);
                })
            );
    }

    private batchAssignToOrgs(userId: number, assignments: { orgId: number; roleId: number }[]): Observable<boolean> {
        if (!assignments.length) return of(true);

        const byOrg = new Map<number, { user_id: number; role_id: number }[]>();
        for (const { orgId, roleId } of assignments) {
            const list = byOrg.get(orgId) ?? [];
            list.push({ user_id: userId, role_id: roleId });
            byOrg.set(orgId, list);
        }

        const requests = Array.from(byOrg.entries()).map(([orgId, items]) =>
            this.userService.assignUsersToOrg(orgId, { assignments: items }).pipe(
                catchError((err: HttpErrorResponse) => {
                    this.toast.error(err.error?.message ?? 'Failed to assign users');
                    return of(false);
                })
            )
        );

        return forkJoin(requests).pipe(map(() => true));
    }

    private computeOrgRemovals(
        userId: number,
        currentAssignments: OrgAssignment[]
    ): { orgId: number; userId: number }[] {
        if (!this.editMode()) return [];
        const previousOrgIds = new Set(this.editUser()!.memberships.map((m) => m.organization.id));
        const currentOrgIds = new Set(currentAssignments.map((a) => a.orgId));
        return [...previousOrgIds].filter((id) => !currentOrgIds.has(id)).map((orgId) => ({ orgId, userId }));
    }

    private batchRemoveFromOrgs(removals: { orgId: number; userId: number }[]): Observable<boolean> {
        if (!removals.length) return of(true);
        return forkJoin(
            removals.map(({ orgId, userId }) =>
                this.userService.removeUserFromOrg(orgId, userId).pipe(
                    catchError((err: HttpErrorResponse) => {
                        this.toast.error(err.error?.message ?? 'Failed to remove user from organization');
                        return of(null);
                    })
                )
            )
        ).pipe(map(() => true));
    }

    private handleSuperadminToggle(userId: number, wantsSuperadmin: boolean): Observable<boolean> {
        if (!this.isSuperAdmin() || !this.editMode()) return of(true);

        const wasSuperadmin = this.editUser()!.isSuperadmin;

        if (wantsSuperadmin && !wasSuperadmin) {
            return this.adminUserService.grantSuperadmin(userId).pipe(
                map(() => true as boolean),
                catchError((err: HttpErrorResponse) => {
                    this.toast.error(err.error?.message ?? 'Failed to grant superadmin');
                    return of(false);
                })
            );
        }
        if (!wantsSuperadmin && wasSuperadmin) {
            return this.adminUserService.revokeSuperadmin(userId).pipe(
                map(() => true as boolean),
                catchError((err: HttpErrorResponse) => {
                    this.toast.error(err.error?.message ?? 'Failed to revoke superadmin');
                    return of(false);
                })
            );
        }

        return of(true);
    }

    private loadOrganizations(): void {
        if (this.isSuperAdmin()) {
            this.organizationsStorage
                .getOrganizations()
                .pipe(
                    takeUntilDestroyed(this.destroyRef),
                    finalize(() => this.loadingOrganizations.set(false))
                )
                .subscribe((orgs) => this.availableOrganizations.set(orgs));
        } else {
            const currentUser = this.currentUserService.currentUserSignal();
            if (currentUser) {
                const adminOrgs = currentUser.memberships.map((m) => ({
                    id: m.organization.id,
                    name: m.organization.name,
                    is_active: true,
                    member_count: 0,
                    created_at: '',
                    updated_at: '',
                }));
                this.availableOrganizations.set(adminOrgs);
                this.loadingOrganizations.set(false);
            }
        }
    }
}
