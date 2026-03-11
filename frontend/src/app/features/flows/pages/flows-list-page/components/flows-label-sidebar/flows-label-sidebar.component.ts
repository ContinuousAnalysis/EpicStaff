import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    OnInit,
    Output,
    EventEmitter,
    signal,
    computed,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog, DialogModule } from '@angular/cdk/dialog';

import {
    LabelsStorageService,
    LabelTreeNode,
} from '../../../../services/labels-storage.service';
import { LabelDto } from '../../../../models/label.model';
import { AppIconComponent } from '../../../../../../shared/components/app-icon/app-icon.component';
import {
    ConfirmationDialogComponent,
    DialogResult,
} from '../../../../../../shared/components/cofirm-dialog/confirmation-dialog.component';

interface FlatLabelNode {
    node: LabelTreeNode;
    depth: number;
}

@Component({
    selector: 'app-flows-label-sidebar',
    standalone: true,
    imports: [CommonModule, FormsModule, DialogModule, AppIconComponent],
    templateUrl: './flows-label-sidebar.component.html',
    styleUrls: ['./flows-label-sidebar.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowsLabelSidebarComponent implements OnInit {
    @Output() closeSidebar = new EventEmitter<void>();

    private readonly labelsStorage = inject(LabelsStorageService);
    private readonly dialog = inject(Dialog);
    private readonly cdr = inject(ChangeDetectorRef);

    // Expose from storage
    readonly labelTree = this.labelsStorage.labelTree;
    readonly activeLabelFilter = this.labelsStorage.activeLabelFilter;

    // Local UI state
    readonly expandedNodes = signal<Set<number>>(new Set());
    readonly addingRootLabel = signal<boolean>(false);
    readonly addingChildOf = signal<number | null>(null);
    readonly editingLabelId = signal<number | null>(null);

    // Plain properties for ngModel bindings
    newLabelNameValue = '';
    editingLabelNameValue = '';

    // Validation error messages
    newLabelError = '';
    renameLabelError = '';

    readonly flatTree = computed<FlatLabelNode[]>(() => {
        const result: FlatLabelNode[] = [];
        const flatten = (nodes: LabelTreeNode[], depth: number) => {
            for (const node of nodes) {
                result.push({ node, depth });
                if (this.isExpanded(node.id) && node.children.length > 0) {
                    flatten(node.children, depth + 1);
                }
            }
        };
        flatten(this.labelTree(), 0);
        return result;
    });

    ngOnInit(): void {
        this.labelsStorage.loadLabels().subscribe();
    }

    toggleExpand(id: number): void {
        this.expandedNodes.update((set) => {
            const next = new Set(set);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    isExpanded(id: number): boolean {
        return this.expandedNodes().has(id);
    }

    selectAll(): void {
        this.labelsStorage.setActiveLabelFilter('all');
    }

    selectUnlabeled(): void {
        this.labelsStorage.setActiveLabelFilter('unlabeled');
    }

    selectLabel(id: number): void {
        this.labelsStorage.setActiveLabelFilter(id);
    }

    startAddRootLabel(): void {
        this.addingRootLabel.set(true);
        this.addingChildOf.set(null);
        this.newLabelNameValue = '';
    }

    cancelAddLabel(): void {
        this.addingRootLabel.set(false);
        this.addingChildOf.set(null);
        this.newLabelNameValue = '';
        this.newLabelError = '';
    }

    startAddChildLabel(parentId: number): void {
        this.addingChildOf.set(parentId);
        this.addingRootLabel.set(false);
        this.newLabelNameValue = '';
        this.expandedNodes.update((s) => new Set([...s, parentId]));
    }

    confirmAddLabel(): void {
        const name = this.newLabelNameValue.trim();
        if (!name) {
            this.cancelAddLabel();
            return;
        }
        this.newLabelError = '';
        const parentId = this.addingChildOf();
        this.labelsStorage
            .createLabel(name, parentId ?? undefined)
            .subscribe({
                next: () => {
                    this.cancelAddLabel();
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.newLabelError = this.parseCreateError(err);
                    this.cdr.markForCheck();
                },
            });
    }

    onNewLabelInput(): void {
        if (this.newLabelError) {
            this.newLabelError = '';
            this.cdr.markForCheck();
        }
    }

    startRename(label: LabelDto): void {
        this.editingLabelId.set(label.id);
        this.editingLabelNameValue = label.name;
    }

    cancelRename(): void {
        this.editingLabelId.set(null);
        this.editingLabelNameValue = '';
        this.renameLabelError = '';
    }

    confirmRename(id: number): void {
        const name = this.editingLabelNameValue.trim();
        if (!name) {
            this.cancelRename();
            return;
        }
        this.renameLabelError = '';
        this.labelsStorage.renameLabel(id, name).subscribe({
            next: () => {
                this.cancelRename();
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.renameLabelError = this.parseCreateError(err);
                this.cdr.markForCheck();
            },
        });
    }

    onRenameLabelInput(): void {
        if (this.renameLabelError) {
            this.renameLabelError = '';
            this.cdr.markForCheck();
        }
    }

    openDeleteDialog(label: LabelTreeNode): void {
        const hasChildren = label.children.length > 0;
        const message = hasChildren
            ? `Delete "${label.name}" and all its sublabels? This cannot be undone.`
            : `Delete "${label.name}"? This cannot be undone.`;

        const dialogRef = this.dialog.open<DialogResult>(
            ConfirmationDialogComponent,
            {
                data: {
                    title: 'Delete Label',
                    message,
                    confirmText: 'Delete',
                    type: 'danger',
                },
            }
        );

        dialogRef.closed.subscribe((result) => {
            if (result === 'confirm') {
                this.labelsStorage.deleteLabel(label.id).subscribe({
                    next: () => {
                        this.cdr.markForCheck();
                    },
                    error: (err) => {
                        console.error('Error deleting label', err);
                    },
                });
            }
        });
    }

    getIndentPadding(depth: number): string {
        return `${depth * 1.2 + 1}rem`;
    }

    private parseCreateError(err: any): string {
        const msg: string = err?.error?.message ?? err?.message ?? '';
        if (
            msg.includes('Top-level label with this name already exists') ||
            msg.includes('name, parent must make a unique set')
        ) {
            return 'This label name already exists. Please try another name.';
        }
        return 'Failed to save label. Please try again.';
    }
}
