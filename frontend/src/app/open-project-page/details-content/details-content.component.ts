import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ProjectsStorageService } from '../../features/projects/services/projects-storage.service';
import { GetProjectRequest } from '../../features/projects/models/project.model';

@Component({
  selector: 'app-details-content',
  templateUrl: './details-content.component.html',
  styleUrls: ['./details-content.component.scss'],
  standalone: true,
  imports: [FormsModule],
})
export class DetailsContentComponent implements OnInit, OnChanges {
  @Input() public description!: string;
  @Input() public tags: string[] = [];
  @Input() public projectId!: number;
  @Output() public tagsUpdated: EventEmitter<string[]> = new EventEmitter<
    string[]
  >();

  public internalDescription: string = '';
  public internalTags: string[] = [];
  public newTag: string = '';
  public duplicateTagName: string | null = null;
  public isEditingDescription: boolean = false;

  private readonly descriptionSubject: Subject<string> = new Subject();
  private readonly tagsSubject: Subject<string[]> = new Subject();

  constructor(private readonly projectsService: ProjectsStorageService) {}

  public ngOnInit(): void {
    this.internalDescription = this.description || '';
    this.internalTags = [...this.tags];

    this.descriptionSubject
      .pipe(debounceTime(500))
      .subscribe((updatedDescription: string) => {
        if (updatedDescription !== this.description) {
          this.updateProjectDescription(updatedDescription);
        }
      });

    this.tagsSubject
      .pipe(debounceTime(300))
      .subscribe((updatedTags: string[]) => {
        this.tagsUpdated.emit(updatedTags);
      });
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['tags']) {
      this.internalTags = [...this.tags];
    }
    if (changes['description']) {
      this.internalDescription = this.description || '';
    }
  }

  public onAddTag(): void {
    let trimmedTag = this.newTag.trim();

    if (trimmedTag.startsWith('#')) {
      trimmedTag = trimmedTag.substring(1);
    }

    if (trimmedTag) {
      const formattedTag =
        trimmedTag.charAt(0).toUpperCase() + trimmedTag.slice(1);

      const duplicate = this.internalTags.find(
        (tag) => tag.toLowerCase() === formattedTag.toLowerCase()
      );

      if (duplicate) {
        this.duplicateTagName = duplicate;
        setTimeout(() => {
          this.duplicateTagName = null;
        }, 820);
      } else {
        this.duplicateTagName = null;
        this.internalTags = [...this.internalTags, formattedTag];
        this.newTag = '';
        this.tagsSubject.next(this.internalTags);
      }
    }
  }

  public onRemoveTag(tag: string): void {
    this.internalTags = this.internalTags.filter((t) => t !== tag);
    this.tagsSubject.next(this.internalTags);
  }

  public onFocusDescription(): void {
    this.isEditingDescription = true;
  }

  public onBlurDescription(): void {
    this.isEditingDescription = false;
  }

  public onDescriptionInput(): void {
    this.descriptionSubject.next(this.internalDescription);
  }

  public getTextareaRows(text: string): number {
    if (!text) return 2;
    const lineCount = text.split('\n').length;
    return Math.min(Math.max(lineCount, 2), 4);
  }

  public adjustTextareaHeight(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 160); // Max height 160px
  }

  private updateProjectDescription(description: string): void {
    if (!this.projectId) {
      console.error('Project ID is required for updating description');
      return;
    }
    this.projectsService
      .patchUpdateProject(this.projectId, { description })
      .subscribe({
        next: (response: GetProjectRequest) => {
          console.log('Description updated successfully', response);
        },
        error: (error: any) => {
          console.error('Error updating description:', error);

          this.internalDescription = this.description || '';
        },
      });
  }
}
