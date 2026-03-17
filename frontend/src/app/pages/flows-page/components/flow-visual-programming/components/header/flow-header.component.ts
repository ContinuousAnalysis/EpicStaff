import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    Input,
    Output,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Spinner2Component } from '../../../../../../shared/components/spinner-type2/spinner.component';
import { AppIconComponent } from '../../../../../../shared/components/app-icon/app-icon.component';
import { Router } from '@angular/router';
import { RunGraphService } from '../../../../../../features/flows/services/run-graph-session.service';
import { Dialog as CdkDialog } from '@angular/cdk/dialog';
import { DialogModule } from '@angular/cdk/dialog';
import { ToastService } from '../../../../../../services/notifications/toast.service';
import { FlowService } from '../../../../../../visual-programming/services/flow.service';
import { GraphDto } from '../../../../../../features/flows/models/graph.model';
import { FlowRenameDialogComponent } from '../../../../../../features/flows/components/flow-rename-dialog/flow-rename-dialog.component';

@Component({
    selector: 'app-flow-header',
    standalone: true,
    imports: [CommonModule, RouterModule, Spinner2Component, AppIconComponent, DialogModule],
    templateUrl: './flow-header.component.html',
    styleUrls: ['./flow-header.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowHeaderComponent {
    @Input() graphName?: string;
    @Input() graphId?: number;
    @Input() graph?: GraphDto;
    @Input() isSaving = false;
    @Input() isRunning = false;
    @Input() hasUnsavedChanges = false;
    @Output() save = new EventEmitter<void>();
    @Output() back = new EventEmitter<void>();
    @Output() viewSessions = new EventEmitter<void>();
    @Output() run = new EventEmitter<void>();
    @Output() getCurl = new EventEmitter<void>();
    @Output() flowEdited = new EventEmitter<GraphDto>();

    private readonly dialog = inject(CdkDialog);

    constructor(private router: Router) {}

    onSave() {
        this.save.emit();
    }

    onBack() {
        this.back.emit();
    }

    onViewSessions() {
        this.viewSessions.emit();
    }

    onRun() {
        this.run.emit();
    }

    onGetCurl() {
        this.getCurl.emit();
    }

    openRenameDialog(): void {
        if (!this.graph) return;
        const dialogRef = this.dialog.open<any>(FlowRenameDialogComponent, {
            data: {
                flowName: this.graph.name,
                flow: {
                    id: this.graph.id,
                    name: this.graph.name,
                    description: this.graph.description || '',
                    label_ids: this.graph.label_ids || [],
                },
            },
            width: '500px',
        });

        dialogRef.closed.subscribe((result) => {
            if (result && typeof result === 'object' && 'id' in result) {
                this.flowEdited.emit(result as GraphDto);
            }
        });
    }
}
