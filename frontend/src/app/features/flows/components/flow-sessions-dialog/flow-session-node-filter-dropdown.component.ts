import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClickOutsideDirective } from '../../../../shared/directives/click-outside.directive';

@Component({
  selector: 'app-flow-session-node-filter-dropdown',
  standalone: true,
  imports: [CommonModule, FormsModule, ClickOutsideDirective],
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <div
      class="node-filter-dropdown"
      [class.open]="open"
      (clickOutside)="closeDropdown()"
    >
      <button class="dropdown-toggle" (click)="toggleDropdown($event)">
        <span class="selected-label">
          <i class="ti ti-diagram"></i>
          {{ selectedValue ?? 'All Nodes' }}
        </span>
        <span class="dropdown-arrow-wrapper">
          <svg class="dropdown-arrow" width="16" height="16" viewBox="0 0 24 24">
            <path
              d="M7 10l5 5 5-5"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
            />
          </svg>
        </span>
      </button>

      @if (open) {
        <div class="dropdown-panel">
          <div class="search-box">
            <i class="ti ti-search search-icon"></i>
            <input
              #searchInput
              type="text"
              class="search-input"
              placeholder="Search nodes..."
              [ngModel]="searchQuery"
              (ngModelChange)="onSearchChange($event)"
              (click)="$event.stopPropagation()"
            />
            @if (searchQuery) {
              <button class="clear-search" (click)="clearSearch($event)">
                <i class="ti ti-x"></i>
              </button>
            }
          </div>

          <ul class="dropdown-menu">
            <li
              (click)="selectNode(null, $event)"
              [class.selected]="selectedValue === null"
            >
              <i class="ti ti-list"></i>
              <span>All Nodes</span>
              @if (selectedValue === null) {
                <span class="checkmark">&#10003;</span>
              }
            </li>

            @for (node of filteredNodes; track node) {
              <li
                (click)="selectNode(node, $event)"
                [class.selected]="selectedValue === node"
              >
                <i class="ti ti-diagram"></i>
                <span>{{ node }}</span>
                @if (selectedValue === node) {
                  <span class="checkmark">&#10003;</span>
                }
              </li>
            } @empty {
              <li class="no-results">
                <i class="ti ti-search-off"></i>
                No nodes found
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styleUrls: ['./flow-session-node-filter-dropdown.component.scss'],
})

export class FlowSessionNodeFilterDropdownComponent implements OnChanges {
    @Input() nodes: string[] = [];
    @Input() value: string | null = null;
    @Output() valueChange = new EventEmitter<string | null>();


    public open = false;
    public selectedValue: string | null = null;
    public searchQuery = '';

    public get filteredNodes(): string[] {
        const search = this.searchQuery.trim().toLowerCase();
        return search
            ? this.nodes.filter((n) => n.toLowerCase().includes(search))
            : [...this.nodes];
    }

    constructor(private cdr: ChangeDetectorRef) {}

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['value']) {
            this.selectedValue = this.value;
        }
        if (changes['nodes']) { 
            this.cdr.markForCheck();
        }
    }

    
    public onSearchChange(query: string): void {
        this.searchQuery = query;
    }

    public clearSearch(event: Event): void {
        event.stopPropagation();
        this.searchQuery = '';
    }

    public toggleDropdown(event: Event): void {
        event.stopPropagation();
        this.open = !this.open;
    }

    public closeDropdown(): void {
        this.open = false;
    }

    public selectNode(node: string | null, event: Event) {
        event.stopPropagation();
        this.selectedValue = node;
        this.valueChange.emit(node);
        this.closeDropdown();
    }
}