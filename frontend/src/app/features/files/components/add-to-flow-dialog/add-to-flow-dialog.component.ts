import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { FlowsApiService } from '../../../flows/services/flows-api.service';
import { StorageItem } from '../../models/storage.models';

export interface AddToFlowDialogData {
    item: StorageItem;
}

export interface AddToFlowDialogResult {
    flowIds: number[];
}

interface FlowOption {
    id: number;
    name: string;
    checked: boolean;
}

@Component({
    selector: 'app-add-to-flow-dialog',
    imports: [FormsModule, AppIconComponent],
    templateUrl: './add-to-flow-dialog.component.html',
    styleUrls: ['./add-to-flow-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddToFlowDialogComponent {
    private dialogRef = inject(DialogRef<AddToFlowDialogResult>);
    readonly data: AddToFlowDialogData = inject(DIALOG_DATA);
    private flowsApiService = inject(FlowsApiService);
    private destroyRef = inject(DestroyRef);

    readonly searchQuery = signal('');
    readonly flows = signal<FlowOption[]>([]);
    readonly isLoading = signal(true);
    readonly dropdownOpen = signal(false);

    readonly visibleFlows = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        const all = this.flows();
        return query ? all.filter((f) => f.name.toLowerCase().includes(query)) : all;
    });

    readonly selectedFlows = computed(() => this.flows().filter((f) => f.checked));

    get selectorLabel(): string {
        const selected = this.selectedFlows();
        if (selected.length === 0) return '';
        if (selected.length === 1) return selected[0].name;
        return `${selected.length} flows selected`;
    }

    get isValid(): boolean {
        return this.selectedFlows().length > 0;
    }

    ngOnInit(): void {
        this.flowsApiService
            .getGraphsLight()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (graphs) => {
                    this.flows.set(graphs.map((g) => ({ id: g.id, name: g.name, checked: false })));
                    this.isLoading.set(false);
                },
                error: () => {
                    this.isLoading.set(false);
                },
            });
    }

    @HostListener('document:click')
    onDocumentClick(): void {
        this.dropdownOpen.set(false);
    }

    toggleDropdown(event: MouseEvent): void {
        event.stopPropagation();
        this.dropdownOpen.update((v) => !v);
    }

    stopPropagation(event: MouseEvent): void {
        event.stopPropagation();
    }

    toggleFlow(flow: FlowOption): void {
        flow.checked = !flow.checked;
        this.flows.update((list) => [...list]);
    }

    onConfirm(): void {
        if (!this.isValid) return;
        this.dialogRef.close({ flowIds: this.selectedFlows().map((f) => f.id) });
    }

    onCancel(): void {
        this.dialogRef.close();
    }
}
