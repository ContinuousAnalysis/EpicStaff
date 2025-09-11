import {
    Component,
    OnInit,
    OnDestroy,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { Dialog, DialogModule } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { RunGraphService } from '../../services/run-graph-session.service';
import { map, takeUntil } from 'rxjs/operators';
import { EditTitleDialogComponent } from './edit-name-dialog/edit-title-dialog.component';
import { ProjectStateService } from '../services/project-state.service';
import { ToastService } from '../../services/notifications/toast.service';
import { Subject } from 'rxjs';
import {
    GetProjectRequest,
    ProjectProcess,
} from '../../features/projects/models/project.model';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';
import { ButtonComponent } from '../../shared/components/buttons/button/button.component';
import { v4 as uuidv4 } from 'uuid';
import { NodeType } from '../../visual-programming/core/enums/node-type';
import { NODE_COLORS } from '../../visual-programming/core/enums/node-config';
import { NODE_ICONS } from '../../visual-programming/core/enums/node-config';
import { FlowsApiService } from '../../features/flows/services/flows-api.service';
import { ConfirmationDialogService } from '../../shared/components/cofirm-dialog/confimation-dialog.service';

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [
        RouterModule,
        FormsModule,
        DialogModule,
        CommonModule,
        AppIconComponent,
        ButtonComponent,
    ],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit, OnDestroy {
    public project: GetProjectRequest | null = null;

    private destroy$ = new Subject<void>();

    constructor(
        private runGraphService: RunGraphService,
        private router: Router,
        private dialog: Dialog,
        private projectStateService: ProjectStateService,
        private toastService: ToastService,
        private cdr: ChangeDetectorRef,
        private flowsApiService: FlowsApiService,
        private confirmationDialog: ConfirmationDialogService
    ) {}

    ngOnInit(): void {
        this.projectStateService.project$
            .pipe(takeUntil(this.destroy$))
            .subscribe((project) => {
                this.project = project;

                this.cdr.markForCheck();
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onRunClick(): void {
        // If project ID is available, call the service
        // if (this.project?.id) {
        //   this.runGraphService
        //     .runProject(this.project.id)
        //     .pipe(
        //       map((result) => {
        //         // Navigate to the new route format with graph ID and session ID
        //         this.router.navigate([
        //           '/graph',
        //           result.graphId,
        //           'session',
        //           result.sessionId,
        //         ]);
        //         return result;
        //       })
        //     )
        //     .subscribe({
        //       error: (error) => {
        //         console.error('Error running project:', error);
        //         this.toastService.error('Failed to run project');
        //       },
        //     });
        // } else {
        //   console.error('Project ID is not defined');
        //   this.toastService.error('No project selected');
        // }
    }

    setProcessType(type: 'sequential' | 'hierarchical'): void {
        if (this.project?.process !== type && this.project?.id) {
            this.projectStateService
                .updateProjectField(
                    this.project.id,
                    'process',
                    type as ProjectProcess
                )
                .subscribe({
                    next: (updatedProject) => {
                        this.project = updatedProject;
                        this.cdr.markForCheck();
                        this.toastService.success(
                            'Process type updated successfully'
                        );
                    },
                    error: (error) => {
                        console.error('Error updating process type:', error);
                        this.toastService.error(
                            'Failed to update process type'
                        );
                    },
                });
        }
    }

    openEditTitleDialog(): void {
        if (!this.project) return;

        const dialogRef = this.dialog.open(EditTitleDialogComponent, {
            width: '400px',
            data: { title: this.project.name },
        });

        dialogRef.closed.subscribe((result) => {
            if (result && typeof result === 'string' && this.project?.id) {
                this.updateProjectTitle(this.project.id, result);
            }
        });
    }

    private updateProjectTitle(projectId: number, newTitle: string): void {
        this.projectStateService
            .updateProjectField(projectId, 'name', newTitle)
            .subscribe({
                next: () => {
                    this.toastService.success(
                        'Project name updated successfully'
                    );
                },
                error: (error) => {
                    console.error('Error updating project title:', error);
                    this.toastService.error('Failed to update project name');
                },
            });
    }

    onCreateFlowWithProject() {
        this.confirmationDialog
            .confirm({
                title: 'Create Flow',
                message: 'Do you want to create a flow with this project?',
                cancelText: 'Cancel',
                confirmText: 'Create Flow',
                type: 'info',
            })
            .subscribe((result) => {
                // Only proceed if result is exactly true (user clicked confirm)
                if (result === true) {
                    const project = this.project;
                    const nodeId = uuidv4();
                    const node = {
                        id: nodeId,
                        category: 'web',
                        position: { x: 200, y: 200 },
                        ports: null,
                        parentId: null,
                        type: NodeType.PROJECT,
                        node_name: `${project!.name} (#1)`,
                        data: project,
                        color: NODE_COLORS[NodeType.PROJECT],
                        icon: NODE_ICONS[NodeType.PROJECT],
                        input_map: {},
                        output_variable_path: null,
                        size: { width: 330, height: 60 },
                    };
                    const metadata = {
                        nodes: [node],
                        connections: [],
                        groups: [],
                    };
                    this.flowsApiService
                        .createGraph({
                            name: `${project!.name} Flow`,
                            description: '',
                            metadata,
                            tags: [],
                        })
                        .subscribe((response: any) => {
                            this.router.navigate(['/flows', response.id]);
                        });
                }
                // If result is false or 'close', the action is cancelled (do nothing)
            });
    }
}
