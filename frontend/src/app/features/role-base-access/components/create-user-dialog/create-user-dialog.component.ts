import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppSvgIconComponent, ButtonComponent, StepConfig, StepperComponent } from '@shared/components';
import { UserRole } from '@shared/models';
import { of } from 'rxjs';

import { CreateUserStep } from '../../enums/create-user-steps.enum';
import { UserService } from '../../services/users/user.service';
import { StepAssignToOrgComponent } from './steps/assign-to-org/step-assign-to-org.component';
import { StepUserDetailsComponent } from './steps/user-details/step-user-details.component';

@Component({
    selector: 'app-create-user-dialog',
    templateUrl: './create-user-dialog.component.html',
    styleUrls: ['./create-user-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AppSvgIconComponent,
        ButtonComponent,
        StepperComponent,
        StepUserDetailsComponent,
        StepAssignToOrgComponent,
    ],
})
export class CreateUserDialogComponent {
    private destroyRef = inject(DestroyRef);
    private dialogRef = inject(DialogRef);
    private userService = inject(UserService);

    private readonly userDetailsStep = viewChild(StepUserDetailsComponent);
    private readonly assignToOrgStep = viewChild(StepAssignToOrgComponent);

    readonly createdUserId = signal<number | null>(null);
    readonly currentStepIndex = signal(0);

    readonly currentStep = computed(() => this.steps()[this.currentStepIndex()]);
    readonly nextDisabled = computed(() => !this.currentStep().canProceed());
    readonly nextText = computed(() => this.currentStep().proceedLabel);
    readonly stepLabels = computed(() => this.steps().map((s) => s.label));

    readonly steps = computed<StepConfig[]>(() => [
        {
            id: CreateUserStep.USER_DETAILS,
            label: 'User details',
            proceedLabel: 'Next',
            canProceed: () => this.userDetailsStep()?.isFormValid() ?? false,
            onProceed: () => {
                // const form = this.userDetailsStep()!.form;
                // const { full_name, email, password, superadmin } = form.getRawValue();

                // const request: CreateUserRequest = {
                //     name: full_name!,
                //     email: email!,
                //     password: password!,
                //     superadmin: superadmin ?? false,
                // };

                return of(true);
                // return this.userService.createUser(request).pipe(
                //     tap((user) => this.createdUserId.set(user.id)),
                //     map(() => true as boolean),
                //     catchError(() => of(false))
                // );
            },
        },
        {
            id: CreateUserStep.ASSIGN_TO_ORG,
            label: 'Assign to Org',
            proceedLabel: 'Create',
            canProceed: () => true,
            onProceed: () => {
                const selections = this.assignToOrgStep()?.selectedOrganizations() ?? [];

                if (!selections.length) {
                    return of(true);
                }

                // TODO: call assignment API once endpoint is available
                // const assignments = selections.map((row) => ({
                //     id: row['id'] as number,
                //     roles: (row['roles'] as UserRole[]) ?? [],
                // }));
                // return this.organizationService.assignUserToOrganizations(this.createdUserId()!, assignments);
                void UserRole; // keep import alive until TODO is implemented
                return of(true);
            },
        },
    ]);

    prevStep(): void {
        this.currentStepIndex.update((i) => Math.max(i - 1, 0));
    }

    nextStep(): void {
        if (!this.currentStep().canProceed()) return;

        this.currentStep()
            .onProceed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((success) => {
                if (!success) return;

                const last = this.steps().length - 1;

                this.currentStepIndex.update((i) => {
                    if (i >= last) {
                        this.onClose();
                        return i;
                    }
                    return i + 1;
                });
            });
    }

    onClose(): void {
        this.dialogRef.close();
    }

    protected readonly CreateUserStep = CreateUserStep;
}
