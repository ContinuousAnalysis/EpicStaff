import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnInit,
} from '@angular/core';
import { DialogRef, DIALOG_DATA, DialogModule } from '@angular/cdk/dialog';
import {
  ReactiveFormsModule,
  FormGroup,
  FormControl,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { McpToolsService } from '../../services/mcp-tools/mcp-tools.service';
import { ToastService } from '../../../../services/notifications/toast.service';
import {
  GetMcpToolRequest,
  CreateMcpToolRequest,
} from '../../models/mcp-tool.model';

interface DialogData {
  selectedTool?: GetMcpToolRequest;
}

@Component({
  selector: 'app-mcp-tool-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CommonModule,
    DialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './mcp-tool-dialog.component.html',
  styleUrls: ['./mcp-tool-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpToolDialogComponent implements OnInit {
  form!: FormGroup;
  public selectedTool?: GetMcpToolRequest;
  public isEditMode: boolean = false;

  constructor(
    private dialogRef: DialogRef<GetMcpToolRequest>,
    private cdr: ChangeDetectorRef,
    private mcpToolsService: McpToolsService,
    private toastService: ToastService,
    @Inject(DIALOG_DATA) public data: DialogData
  ) {
    if (data?.selectedTool) {
      this.selectedTool = data.selectedTool;
      this.isEditMode = true;
    }
  }

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.form = new FormGroup({
      name: new FormControl(this.selectedTool?.name || '', [
        Validators.required,
        Validators.minLength(1),
        Validators.maxLength(255),
      ]),
      transport: new FormControl(this.selectedTool?.transport || '', [
        Validators.required,
        Validators.maxLength(2048),
      ]),
      tool_name: new FormControl(this.selectedTool?.tool_name || '', [
        Validators.required,
        Validators.maxLength(255),
      ]),
      timeout: new FormControl(this.selectedTool?.timeout ?? 30),
      auth: new FormControl(this.selectedTool?.auth || ''),
      init_timeout: new FormControl(this.selectedTool?.init_timeout ?? 10),
    });
  }

  public onCancel(): void {
    this.dialogRef.close(undefined);
  }

  public onSave(): void {
    if (this.form.invalid) {
      this.toastService.error('Please fill in all required fields correctly.');
      this.form.markAllAsTouched();
      this.cdr.markForCheck();
      return;
    }

    const formValue = this.form.value;

    // Clean up empty values
    const toolData: CreateMcpToolRequest = {
      name: formValue.name,
      transport: formValue.transport,
      tool_name: formValue.tool_name,
      timeout: formValue.timeout || undefined,
      auth: formValue.auth || undefined,
      init_timeout: formValue.init_timeout || undefined,
    };

    if (this.isEditMode && this.selectedTool) {
      this.mcpToolsService
        .updateMcpTool(this.selectedTool.id, toolData)
        .subscribe({
          next: (updatedTool) => {
            this.toastService.success(
              `MCP tool "${updatedTool.name}" updated successfully!`
            );
            this.dialogRef.close(updatedTool);
          },
          error: (error) => {
            console.error('Error updating MCP tool:', error);
            this.toastService.error(
              'Failed to update MCP tool. Please try again.'
            );
            this.cdr.markForCheck();
          },
        });
    } else {
      this.mcpToolsService.createMcpTool(toolData).subscribe({
        next: (createdTool) => {
          this.toastService.success(
            `MCP tool "${createdTool.name}" created successfully!`
          );
          this.dialogRef.close(createdTool);
        },
        error: (error) => {
          console.error('Error creating MCP tool:', error);
          this.toastService.error(
            'Failed to create MCP tool. Please try again.'
          );
          this.cdr.markForCheck();
        },
      });
    }
  }

  public getFieldError(fieldName: string): string | null {
    const field = this.form.get(fieldName);
    if (field?.invalid && (field?.dirty || field?.touched)) {
      if (field.errors?.['required']) {
        return 'This field is required';
      }
      if (field.errors?.['minlength']) {
        return `Minimum length is ${field.errors['minlength'].requiredLength}`;
      }
      if (field.errors?.['maxlength']) {
        return `Maximum length is ${field.errors['maxlength'].requiredLength}`;
      }
    }
    return null;
  }
}

