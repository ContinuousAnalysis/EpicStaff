import { Component, OnInit, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormArray,
} from '@angular/forms';
import {
  Dialog,
  DialogRef,
  DIALOG_DATA,
  DialogModule,
} from '@angular/cdk/dialog';

import { ChunkStrategy } from '../../../models/source-collection.model';
import { CollectionsService } from '../../../services/source-collections.service';
import { ToastService } from '../../../../../services/notifications/toast.service';
import { FileUploadContainerComponent } from '../../create-collection-dialog/file-upload-container/file-upload-container.component';
import { ButtonComponent } from '../../../../../shared/components/buttons/button/button.component';

@Component({
  selector: 'app-file-upload-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DialogModule,
    FileUploadContainerComponent,
    ButtonComponent,
  ],
  templateUrl: './file-upload-dialog.component.html',
  styleUrls: ['./file-upload-dialog.component.scss'],
})
export class FileUploadDialogComponent implements OnInit {
  @ViewChild(FileUploadContainerComponent)
  fileUploader!: FileUploadContainerComponent;

  filesForm: FormGroup;
  hasInvalidFiles = false;

  maxChunkSize = 8000;
  maxOverlapSize = 1000;

  chunkStrategies: { label: string; value: ChunkStrategy }[] = [
    { label: 'Token', value: 'token' },
    { label: 'Character', value: 'character' },
    { label: 'Markdown', value: 'markdown' },
    { label: 'JSON', value: 'json' },
    { label: 'HTML', value: 'html' },
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: DialogRef<any>,
    private _GetSourceCollectionRequestsService: CollectionsService,
    private toastService: ToastService,
    @Inject(DIALOG_DATA) public data: { collectionId: number }
  ) {
    this.filesForm = this.fb.group({
      fileSettings: this.fb.array([]),
    });
  }

  ngOnInit(): void {}

  get fileSettingsFormArray() {
    return this.filesForm.get('fileSettings') as FormArray;
  }

  onInvalidFilesChange(hasInvalidFiles: boolean): void {
    this.hasInvalidFiles = hasInvalidFiles;
  }

  onSubmit(): void {
    if (
      this.filesForm.valid &&
      this.fileSettingsFormArray.length > 0 &&
      !this.hasInvalidFiles
    ) {
      const filesWithSettings = this.fileUploader.getFiles();
      console.log('Files to upload with settings:', filesWithSettings);

      const formData = new FormData();

      formData.append('collection_id', this.data.collectionId.toString());

      filesWithSettings.forEach((fileWithSettings, index) => {
        const fileIndex = index + 1;

        formData.append(
          `files[${fileIndex}]`,
          fileWithSettings.file,
          fileWithSettings.file.name
        );

        formData.append(
          `chunk_strategies[${fileIndex}]`,
          fileWithSettings.chunkStrategy
        );
        formData.append(
          `chunk_sizes[${fileIndex}]`,
          fileWithSettings.chunkSize.toString()
        );
        formData.append(
          `chunk_overlaps[${fileIndex}]`,
          fileWithSettings.overlapSize.toString()
        );
      });

      formData.append('additional_params', '{}');

      const debug: { [key: string]: any } = {};
      formData.forEach((val, key) => (debug[key] = val));
      console.log('FormData to be sent:', debug);

      this._GetSourceCollectionRequestsService
        .uploadFiles(this.data.collectionId, formData)
        .subscribe({
          next: (response) => {
            console.log('Upload successful:', response);
            const fileCount = filesWithSettings.length;
            this.toastService.success(
              `Successfully added ${fileCount} file${
                fileCount > 1 ? 's' : ''
              } to collection!`,
              5000,
              'bottom-right'
            );
            this.dialogRef.close(response);
          },
          error: (error) => {
            console.error('Upload failed', error);
            this.toastService.error(
              'Failed to upload files. Please try again.',
              7000,
              'bottom-right'
            );
          },
        });
    } else {
      console.warn('Form invalid or no files selected or has invalid files');
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
