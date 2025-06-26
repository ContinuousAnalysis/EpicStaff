import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';

@Component({
  selector: 'app-tool-libraries',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, HelpTooltipComponent],
  templateUrl: './tool-libraries.component.html',
  styleUrls: ['./tool-libraries.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolLibrariesComponent {
  private _libraries: string[] = [];

  @Input()
  set libraries(value: string[] | null | undefined) {
    this._libraries = value || [];
  }

  get libraries(): string[] {
    return this._libraries;
  }

  public libraryInput: string = '';

  constructor(private cdr: ChangeDetectorRef) {}

  public addLibrary(): void {
    const lib = this.libraryInput.trim();
    if (lib) {
      this._libraries.push(lib);
      this.libraryInput = '';
      this.cdr.markForCheck();
    }
  }

  public removeLibrary(index: number): void {
    this._libraries.splice(index, 1);
    this.cdr.markForCheck();
  }
}
