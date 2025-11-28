import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    signal,
    computed,
    effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValuePreviewTooltipComponent } from './value-preview-tooltip/value-preview-tooltip.component';

export interface AutocompleteItem {
    key: string;
    path: string;
    value: any;
    type: 'group' | 'value';
}

@Component({
    selector: 'app-autocomplete-overlay',
    standalone: true,
    imports: [CommonModule, ValuePreviewTooltipComponent],
    templateUrl: './autocomplete-overlay.component.html',
    styleUrls: ['./autocomplete-overlay.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutocompleteOverlayComponent {
    // Using input/output model now, but to make signals writable from parent component (ExpressionEditor)
    // which creates this component dynamically, we need to expose the signals directly or use input signals.
    // Input signals are read-only from the outside in terms of .set(), but the parent binds to them.
    // Since we are manually creating the component instance, we can manually set the input signals 
    // if we cast them or if we change them to ModelSignals (Angular 17.2+) or just WritableSignals.
    // For compatibility and ease with manual component creation:
    public items = signal<AutocompleteItem[]>([]);
    public currentPath = signal<string[]>([]);
    public filterText = signal<string>('');
    
    public itemSelected = output<AutocompleteItem>();
    public navigateUp = output<void>();
    public navigateDown = output<AutocompleteItem>();

    public activeItem = signal<AutocompleteItem | null>(null);

    public filteredItems = computed(() => {
        const filter = this.filterText().toLowerCase();
        const allItems = this.items();
        if (!filter) return allItems;
        
        return allItems.filter(item => 
            item.key.toLowerCase().includes(filter)
        );
    });

    public hoveredItem = signal<AutocompleteItem | null>(null);

    constructor() {
        effect(() => {
            const items = this.filteredItems();
            // Reset active item when items change, effectively selecting first one
            if (items.length > 0) {
                this.activeItem.set(items[0]);
            } else {
                this.activeItem.set(null);
            }
        }, { allowSignalWrites: true });
    }

    public selectItem(item: AutocompleteItem): void {
        this.itemSelected.emit(item);
    }

    public onBreadcrumbClick(event: MouseEvent): void {
        event.stopPropagation();
        event.preventDefault();
        this.navigateUp.emit();
    }
    
    public typeof(value: any): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    public onArrowClick(event: MouseEvent, item: AutocompleteItem): void {
        event.stopPropagation();
        event.preventDefault();
        this.navigateDown.emit(item);
    }

    public onMouseEnter(item: AutocompleteItem): void {
        this.activeItem.set(item);
        this.hoveredItem.set(item);
    }

    public onMouseLeave(): void {
        this.hoveredItem.set(null);
    }

    public selectActive(): void {
        const active = this.activeItem();
        if (active) {
            this.selectItem(active);
        }
    }

    public navigateNext(): void {
        const items = this.filteredItems();
        if (items.length === 0) return;

        const currentIndex = items.indexOf(this.activeItem() as AutocompleteItem);
        const nextIndex = (currentIndex + 1) % items.length;
        this.activeItem.set(items[nextIndex]);
    }

    public navigatePrev(): void {
        const items = this.filteredItems();
        if (items.length === 0) return;

        const currentIndex = items.indexOf(this.activeItem() as AutocompleteItem);
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        this.activeItem.set(items[prevIndex]);
    }
}

