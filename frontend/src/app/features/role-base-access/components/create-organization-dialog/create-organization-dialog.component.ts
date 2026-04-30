import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent, CustomInputComponent, TableRow, ValidationErrorsComponent } from '@shared/components';
import { CreateOrganizationRequest } from '@shared/models';
import { finalize } from 'rxjs';

import { ToastService } from '../../../../services/notifications';
import { OrganizationsStorageService } from '../../services/admin/organizations-storage.service';

@Component({
    selector: 'app-create-organization-dialog',
    templateUrl: './create-organization-dialog.component.html',
    styleUrls: ['./create-organization-dialog.component.scss'],
    imports: [ButtonComponent, ReactiveFormsModule, ValidationErrorsComponent, CustomInputComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateOrganizationDialogComponent {
    private destroyRef = inject(DestroyRef);
    private toast = inject(ToastService);
    private dialogRef = inject(DialogRef);
    private organizationStorage = inject(OrganizationsStorageService);

    orgNameControl = new FormControl('', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]);

    // usersTableData = signal<TableRow[]>([]);
    searchTerm = signal('');
    // isUsersLoading = signal(true);
    isCreatingOrganization = signal(false);
    readonly selectedUsers = signal<TableRow[]>([]);

    // filteredUsers = computed(() => {
    //     const term = this.searchTerm().toLowerCase().trim();
    //     if (!term) return this.usersTableData();
    //     return this.usersTableData().filter(
    //         (row) =>
    //             (row['name'] as string)?.toLowerCase().includes(term) ||
    //             (row['email'] as string)?.toLowerCase().includes(term)
    //     );
    // });

    // onSelection(items: TableRow[]): void {
    //     this.selectedUsers.set(items);
    // }

    onCancel(): void {
        this.dialogRef.close();
    }

    onCreate(): void {
        if (this.orgNameControl.invalid) {
            this.orgNameControl.markAsTouched();
            return;
        }

        this.isCreatingOrganization.set(true);

        const request: CreateOrganizationRequest = {
            name: this.orgNameControl.value!,
        };

        this.organizationStorage
            .createOrganization(request)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isCreatingOrganization.set(false))
            )
            .subscribe({
                next: () => {
                    this.toast.success('Organization created successfully.');
                    this.dialogRef.close(true);
                },
                error: (err) => {
                    this.toast.error(err.error.message);
                },
            });
    }
}
