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
    private lastInitializedNodeId: string | null = null;

    node = input.required<T>();
    save = output<NodeModel>();

    public form!: FormGroup;

    constructor() {
        effect(() => {
            const currentNode = this.node();
            if (!currentNode) return;
            if (this.lastInitializedNodeId !== currentNode.id) {
                this.form = this.initializeForm();
                this.lastInitializedNodeId = currentNode.id;
            }
        });
    }

    ngOnInit(): void {
        this.form = this.initializeForm();
        const n = this.node();
        this.lastInitializedNodeId = n ? n.id : null;
    }

    ngOnDestroy(): void {}

    public onSave(): void {
        if (this.form && this.form.invalid) {
            const originalNode = this.node();
            if (originalNode) {
                this.save.emit(originalNode);
            }
            return;
        }
        const updatedNode = this.createUpdatedNode();
        this.save.emit(updatedNode);
    }

    public onEscape(): void {
        this.onSave();
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
