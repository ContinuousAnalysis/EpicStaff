import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { IconButtonComponent } from '../../../../shared/components/buttons/icon-button/icon-button.component';
import { ToastService } from '../../../../services/notifications/toast.service';

@Component({
  selector: 'app-code-editor',
  imports: [
    FormsModule,
    NgIf,
    MonacoEditorModule,
    AppIconComponent,
    IconButtonComponent,
  ],
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class CodeEditorComponent {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;

  @Input() public pythonCode: string = '';
  @Output() public pythonCodeChange = new EventEmitter<string>();
  @Output() public errorChange = new EventEmitter<boolean>();

  private monacoEditor: any;
  public editorLoaded = false;

  public editorOptions = {
    theme: 'vs-dark',
    language: 'python',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    wrappingIndent: 'indent',
    wordWrapMinified: true,
    formatOnPaste: true,
    formatOnType: true,
    tabSize: 4,
  };

  constructor(
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private toastService: ToastService
  ) {}

  public onCodeChange(newValue: string): void {
    this.pythonCode = newValue;
    this.pythonCodeChange.emit(newValue);
    this.errorChange.emit(false); // No longer validate main function
    this.cdr.markForCheck();
  }

  public onEditorInit(editor: any): void {
    this.editorLoaded = true;
    this.monacoEditor = editor;

    if (this.monacoEditor) {
      this.monacoEditor.updateOptions({
        wordWrapBreakAfterCharacters: ',:',
        wordWrapBreakBeforeCharacters: '}])',
      });
    }

    this.cdr.markForCheck();
  }

  public copyCode(): void {
    navigator.clipboard
      .writeText(this.pythonCode)
      .then(() => {
        this.toastService.success(
          'Code copied to clipboard!',
          3000,
          'bottom-right'
        );
      })
      .catch(() => {
        this.toastService.error('Failed to copy code', 3000, 'top-right');
      });
  }
}
