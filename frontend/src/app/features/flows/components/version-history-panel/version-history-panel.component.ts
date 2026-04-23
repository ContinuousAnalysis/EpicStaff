import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { Component, HostListener, Inject, OnInit } from '@angular/core';
import { IconButtonComponent } from '@shared/components';

import { GraphVersionDto } from '../../models/graph.model';
import { FlowsApiService } from '../../services/flows-api.service';

@Component({
    selector: 'app-version-history-panel',
    imports: [IconButtonComponent, CommonModule],
    templateUrl: './version-history-panel.component.html',
    styleUrl: './version-history-panel.component.scss',
})
export class VersionHistoryPanelComponent implements OnInit {
    public versionsList: GraphVersionDto[] = [];
    public openMenuId: number | null = null;

    @HostListener('document:click')
    onDocumentClick(): void {
        this.openMenuId = null;
    }

    public toggleMenu(id: number): void {
        this.openMenuId = this.openMenuId === id ? null : id;
    }

    constructor(
        private flowApiService: FlowsApiService,
        @Inject(DIALOG_DATA) public data: { graphId: number },
        public dialogRef: DialogRef<void>
    ) {}

    public ngOnInit(): void {
        this.loadVersions();
    }

    private loadVersions(): void {
        this.flowApiService.getGraphVersions(this.data.graphId).subscribe({
            next: (result) => {
                this.versionsList = result;
            },
            error: (err) => {
                console.error('Failed to load graph versions', err);
            },
        });
    }
}
