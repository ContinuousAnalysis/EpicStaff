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
import { FlowsStorageService } from '../../../../services/flows-storage.service';
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
    private readonly flowsStorageService = inject(FlowsStorageService);
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
        this.labelsStorage.createLabel(name, parentId ?? undefined).subscribe({
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
        const flows = this.flowsStorageService.flows();
        const sublabelCount = this.countAllDescendants(label);
        const sublabelIds = this.getAllDescendantIds(label);

        const directFlowCount = flows.filter((f) =>
            (f.label_ids || []).includes(label.id),
        ).length;

        const sublabelFlowCount =
            sublabelIds.length > 0
                ? flows.filter((f) =>
                      (f.label_ids || []).some((id) =>
                          sublabelIds.includes(id),
                      ),
                  ).length
                : 0;

        let caution: string | undefined;
        if (directFlowCount > 0 || sublabelCount > 0) {
            const parts: string[] = [];
            if (directFlowCount > 0) {
                parts.push(
                    `<strong>${directFlowCount} flow${directFlowCount !== 1 ? 's' : ''}</strong>`,
                );
            }
            if (sublabelCount > 0) {
                const sublabelPart = `<strong>${sublabelCount} sublabel${sublabelCount !== 1 ? 's' : ''}</strong>`;
                if (sublabelFlowCount > 0) {
                    parts.push(
                        `${sublabelPart} containing <strong>${sublabelFlowCount} flow${sublabelFlowCount !== 1 ? 's' : ''}</strong>`,
                    );
                } else {
                    parts.push(sublabelPart);
                }
            }
            caution = `The label is used in ${parts.join(' and ')}.`;
        }

        const dialogRef = this.dialog.open<DialogResult>(
            ConfirmationDialogComponent,
            {
                width: '500px',
                data: {
                    title: 'Delete labels',
                    message: `Are you sure you want to delete <strong>${label.name}</strong> label? This will remove it from all flows and sublabels.`,
                    confirmText: 'Delete',
                    type: 'danger',
                    isShownBorder: true,
                    caution,
                },
            },
        );

        dialogRef.closed.subscribe((result) => {
            if (result === 'confirm') {
                this.labelsStorage.deleteLabel(label.id).subscribe({
                    next: () => {
                        this.flowsStorageService.getFlows(true).subscribe();
                        this.cdr.markForCheck();
                    },
                    error: (err) => {
                        console.error('Error deleting label', err);
                    },
                });
            }
        });
    }

    private countAllDescendants(node: LabelTreeNode): number {
        return node.children.reduce(
            (acc, child) => acc + 1 + this.countAllDescendants(child),
            0,
        );
    }

    private getAllDescendantIds(node: LabelTreeNode): number[] {
        const ids: number[] = [];
        const collect = (n: LabelTreeNode) => {
            for (const child of n.children) {
                ids.push(child.id);
                collect(child);
            }
        };
        collect(node);
        return ids;
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
