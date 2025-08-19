import {
    Component,
    EventEmitter,
    Output,
    OnInit,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectTagsStorageService } from '../../services/project-tags-storage.service';
import { GetCrewTagRequest } from '../../models/crew-tag.model';
import { ButtonModule } from 'primeng/button';
import { PopoverModule } from 'primeng/popover';
import { Popover } from 'primeng/popover';
import { BadgeModule } from 'primeng/badge';

export interface ProjectTagsFilterChange {
    selectedTagIds: number[];
}

@Component({
    selector: 'app-project-tags-filter',
    standalone: true,
    imports: [CommonModule, ButtonModule, PopoverModule, BadgeModule],
    templateUrl: './project-tags-filter.component.html',
    styleUrls: ['./project-tags-filter.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTagsFilterComponent implements OnInit {
    private readonly projectTagsService = inject(ProjectTagsStorageService);

    @Output() change = new EventEmitter<ProjectTagsFilterChange>();
    @ViewChild('op') overlayPanel!: Popover;

    // Component state
    isDropdownOpen = signal(false);
    selectedTagIds = signal<number[]>([]);
    tempSelectedTagIds = signal<number[]>([]);

    // Computed values
    allTags = this.projectTagsService.allTags;
    isTagsLoaded = this.projectTagsService.isTagsLoaded;

    selectedTagsCount = computed(() => this.selectedTagIds().length);
    buttonText = computed(() => {
        const count = this.selectedTagsCount();
        return count > 0 ? `Tags (${count})` : 'Tags';
    });

    ngOnInit(): void {
        this.projectTagsService.getTags().subscribe();
    }

    public initTempSelection(): void {
        this.tempSelectedTagIds.set([...this.selectedTagIds()]);
    }

    public toggleOverlay(event: Event): void {
        this.overlayPanel.toggle(event);
    }

    isTagSelected(tagId: number): boolean {
        return this.tempSelectedTagIds().includes(tagId);
    }

    toggleTag(tagId: number): void {
        const current = this.tempSelectedTagIds();
        if (current.includes(tagId)) {
            this.tempSelectedTagIds.set(current.filter((id) => id !== tagId));
        } else {
            this.tempSelectedTagIds.set([...current, tagId]);
        }
    }

    onApply(): void {
        this.selectedTagIds.set([...this.tempSelectedTagIds()]);
        this.change.emit({ selectedTagIds: this.selectedTagIds() });
        this.overlayPanel.hide();
    }

    onCancel(): void {
        this.tempSelectedTagIds.set([...this.selectedTagIds()]);
        this.overlayPanel.hide();
    }

    onClearAll(): void {
        this.tempSelectedTagIds.set([]);
    }

    trackByTagId(index: number, tag: GetCrewTagRequest): number {
        return tag.id;
    }
}
