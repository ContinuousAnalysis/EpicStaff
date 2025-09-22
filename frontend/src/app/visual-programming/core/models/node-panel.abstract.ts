import {
    Component,
    DestroyRef,
    OnDestroy,
    OnInit,
    inject,
    input,
    output,
    effect,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NodeModel } from './node.model';
import { ShortcutListenerDirective } from '../directives/shortcut-listener.directive';
import { isEqual } from 'lodash';
import { UniqueNodeNameValidatorService } from '../../services/unique-node-name.validator';

@Component({
    template: '',
    standalone: true,
    imports: [],
    hostDirectives: [
        {
            directive: ShortcutListenerDirective,
            outputs: ['escape: escape'],
        },
    ],
    host: {
        '(escape)': 'onEscape()',
    },
})
export abstract class BaseSidePanel<T extends NodeModel>
    implements OnInit, OnDestroy
{
    protected fb = inject(FormBuilder);
    protected uniqueNameValidator = inject(UniqueNodeNameValidatorService);

    node = input.required<T>();
    save = output<NodeModel>();
    close = output<void>();

    public form!: FormGroup;

    constructor() {
        // Reinitialize form whenever the node input changes
        effect(() => {
            const currentNode = this.node();
            if (currentNode) {
                this.form = this.initializeForm();
            }
        });
    }

    ngOnInit(): void {
        this.form = this.initializeForm();
    }

    ngOnDestroy(): void {}

    public onSave(): void {
        if (this.form.invalid) {
            return;
        }
        const updatedNode = this.createUpdatedNode();
        this.save.emit(updatedNode);
    }

    public onEscape(): void {
        if (!this.form) {
            this.close.emit();
            return;
        }
        if (!this.form.invalid) {
            const updatedNode = this.createUpdatedNode();
            this.save.emit(updatedNode);
        }
        this.close.emit();
    }

    // Returns the updated node without emitting outputs or closing the panel
    public onSaveSilently(): T | null {
        if (!this.form) return null;
        if (this.form.invalid) return null;
        try {
            return this.createUpdatedNode();
        } catch {
            return null;
        }
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
