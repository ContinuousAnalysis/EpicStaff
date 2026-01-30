import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { ResizableDirective } from '../../../user-settings-page/tools/custom-tool-editor/directives/resizable.directive';

@Component({
  selector: 'app-json-editor',
  imports: [FormsModule, NgIf, MonacoEditorModule, ResizableDirective],
  templateUrl: './json-editor.component.html',
  styleUrls: ['./json-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class JsonEditorComponent implements OnChanges {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;

  @Input() public jsonData: string = '{}';
  @Input() public editorHeight: number = 200;
  @Input() public fullHeight: boolean = false;
  @Input() public showHeader: boolean = true;

  public editorLoaded = false;
  private lastExternalValue: string = '{}';
  @Output() public jsonChange = new EventEmitter<string>();
  @Output() public validationChange = new EventEmitter<boolean>();

  private monacoEditor: any;
  public jsonIsValid = true;

  @Input() public editorOptions: any = {
    theme: 'vs-dark',
    language: 'json',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    wrappingIndent: 'indent',
    wordWrapBreakAfterCharacters: ',',
    wordWrapBreakBeforeCharacters: '}]',
    formatOnPaste: true,
    formatOnType: true,
    tabSize: 2,
    readOnly: false,
  };

  constructor(private cdr: ChangeDetectorRef, private zone: NgZone) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jsonData']) {
      const newValue = changes['jsonData'].currentValue;
      const isFirst = changes['jsonData'].firstChange;
      
      // On first change, if editor exists, set the value directly
      if (isFirst && this.monacoEditor && newValue && newValue !== '{}') {
        this.lastExternalValue = newValue;
        this.monacoEditor.setValue(newValue);
        setTimeout(() => this.monacoEditor?.getAction('editor.action.formatDocument')?.run(), 50);
        this.cdr.markForCheck();
      }
      // On subsequent changes
      else if (!isFirst && this.monacoEditor && newValue !== this.lastExternalValue) {
        this.lastExternalValue = newValue;
        this.monacoEditor.setValue(newValue || '{}');
        setTimeout(() => {
          this.monacoEditor?.getAction('editor.action.formatDocument')?.run();
        }, 50);
        this.cdr.markForCheck();
      }
    }
  }

  public onJsonChange(newValue: string): void {
    try {
      JSON.parse(newValue);
      this.jsonIsValid = true;
    } catch (e) {
      this.jsonIsValid = false;
    }

    this.validationChange.emit(this.jsonIsValid);
    this.jsonChange.emit(newValue);
    this.cdr.markForCheck();
  }

  public onEditorInit(editor: any): void {
    this.editorLoaded = true;
    this.monacoEditor = editor;
    this.lastExternalValue = this.jsonData;

    if (this.monacoEditor) {
      this.monacoEditor.updateOptions(this.editorOptions);
      this.monacoEditor.setValue(this.jsonData || '{}');

      setTimeout(() => {
        this.monacoEditor?.getAction('editor.action.formatDocument')?.run();
      }, 100);
    }

    this.cdr.markForCheck();
  }

  public onResize(newHeight: number): void {
    this.editorHeight = newHeight;
    if (this.monacoEditor && typeof this.monacoEditor.layout === 'function') {
      this.monacoEditor.layout();
    }
  }

  public formatJson(): void {
    if (this.monacoEditor) {
      this.monacoEditor.getAction('editor.action.formatDocument').run();
    }
  }
}
