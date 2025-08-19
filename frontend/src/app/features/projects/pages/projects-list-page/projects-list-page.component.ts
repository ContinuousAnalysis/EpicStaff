import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CreateProjectComponent } from '../../components/create-project-form-dialog/create-project.component';
import { ProjectsStorageService } from '../../services/projects-storage.service';
import { GetProjectRequest } from '../../models/project.model';
import {
    ProjectTagsFilterComponent,
    ProjectTagsFilterChange,
} from '../../components/project-tags-filter/project-tags-filter.component';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { SelectButtonModule } from 'primeng/selectbutton';

@Component({
    selector: 'app-projects-list-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './projects-list-page.component.html',
    styleUrls: ['./projects-list-page.component.scss'],
    imports: [
        RouterOutlet,
        ProjectTagsFilterComponent,
        FormsModule,
        ButtonModule,
        InputTextModule,
        SelectButtonModule,
    ],
})
export class ProjectsListPageComponent implements OnDestroy {
    public tabs = [
        { label: 'My projects', value: 'my' },
        { label: 'Templates', value: 'templates' },
    ];

    public selectedTab: string = 'my';

    // Search term for ngModel binding
    public searchTerm: string = '';

    // For debounce
    private searchTerms = new Subject<string>();
    private subscription: Subscription;

    constructor(
        public router: Router,
        private dialog: Dialog,
        private projectsService: ProjectsStorageService
    ) {
        // Setup search with debounce
        this.subscription = this.searchTerms
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe((term) => {
                this.updateFilter(term);
            });

        // Set initial tab based on current route
        if (this.router.url.includes('/projects/templates')) {
            this.selectedTab = 'templates';
        }
    }

    ngOnDestroy(): void {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }

        // Reset search filter when component is destroyed
        this.searchTerm = '';
        this.projectsService.setFilter(null);
    }

    get isMyProjectsActive(): boolean {
        return this.router.url.includes('/projects/my');
    }
    get isTemplatesActive(): boolean {
        return this.router.url.includes('/projects/templates');
    }

    public onSearchTermChange(term: string): void {
        this.searchTerms.next(term);
    }

    public onTabChange(value: string): void {
        this.selectedTab = value;
        this.router.navigate(['/projects', value]);
    }

    private updateFilter(searchTerm: string): void {
        const filter = {
            searchTerm,
            selectedTagIds:
                this.projectsService.getCurrentFilter()?.selectedTagIds || [],
        };
        this.projectsService.setFilter(filter);
    }

    public onProjectTagsChange(event: ProjectTagsFilterChange): void {
        const filter = {
            searchTerm: this.searchTerm,
            selectedTagIds: event.selectedTagIds,
        };
        this.projectsService.setFilter(filter);
    }

    public openCreateProjectDialog(): void {
        const dialogRef = this.dialog.open<GetProjectRequest | undefined>(
            CreateProjectComponent,
            {
                width: '590px',
            }
        );
        dialogRef.closed.subscribe((result: GetProjectRequest | undefined) => {
            if (result) {
                this.router.navigate(['/projects', result.id]);
            }
        });
    }
}
