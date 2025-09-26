import { Component, DestroyRef, inject, input, effect } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NodeModel } from './node.model';
import { UniqueNodeNameValidatorService } from '../../services/unique-node-name.validator';

@Component({
    template: '',
    standalone: true,
    imports: [],
})
export abstract class BaseSidePanel<T extends NodeModel> {
    protected fb = inject(FormBuilder);
    protected uniqueNameValidator = inject(UniqueNodeNameValidatorService);
    private lastInitializedNodeId: string | null = null;

    node = input.required<T>();

    public form!: FormGroup;

    constructor() {
        effect(() => {
            const node = this.node();
            if (node) {
                this.form = this.initializeForm();
                this.lastInitializedNodeId = node.id;
            }
        });
    }

    public onSave(): T | null {
        if (this.form && this.form.invalid) {
            const originalNode = this.node();
            if (originalNode) {
                return originalNode;
            }
            return null;
        }
        const updatedNode = this.createUpdatedNode();
        return updatedNode;
    }

    public onEscape(): void {
        this.onSave();
    }
    protected createNodeNameValidators(
        additionalValidators: any[] = []
    ): any[] {
        const currentNodeId = this.node().id;
        return [
            Validators.required,
            this.uniqueNameValidator.createSyncUniqueNameValidator(
                currentNodeId
            ),
            ...additionalValidators,
        ];
    }

    protected getNodeNameErrorMessage(): string {
        const nodeNameControl = this.form.get('node_name');
        if (nodeNameControl && nodeNameControl.errors) {
            return this.uniqueNameValidator.getValidationErrorMessage(
                nodeNameControl.errors
            );
        }
        return '';
    }

    protected abstract initializeForm(): FormGroup;
    protected abstract createUpdatedNode(): T;
}
