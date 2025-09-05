import {
    Component,
    DestroyRef,
    OnDestroy,
    OnInit,
    inject,
    input,
    output,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NodeModel } from './node.model';
import { ShortcutListenerDirective } from '../directives/shortcut-listener.directive';
import { isEqual } from 'lodash';

@Component({
    template: '',
    standalone: true,
    imports: [ShortcutListenerDirective],
    hostDirectives: [
        {
            directive: ShortcutListenerDirective,
            outputs: ['escape: escape'],
        },
    ],
    host: {
        '(escape)': 'onSave()',
    },
})
export abstract class BaseSidePanel<T extends NodeModel>
    implements OnInit, OnDestroy
{
    protected fb = inject(FormBuilder);

    node = input.required<T>();
    save = output<NodeModel>();

    public form!: FormGroup;

    constructor() {}

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

    protected abstract initializeForm(): FormGroup;
    protected abstract createUpdatedNode(): T;
}
