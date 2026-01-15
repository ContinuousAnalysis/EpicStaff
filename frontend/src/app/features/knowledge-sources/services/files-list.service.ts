import {inject, Injectable, WritableSignal} from "@angular/core";
import {MAX_DOCUMENT_SIZE, MIME_TYPES} from "../constants/constants";
import {CollectionDocument, DisplayedListDocument} from "../models/document.model";
import {DocumentsStorageService} from "./documents-storage.service";

@Injectable({
    providedIn: 'root',
})
export class FileListService {
    private readonly allowedMimeTypes = MIME_TYPES;
    private documentsStorageService = inject(DocumentsStorageService);

    filterValidFiles(files: File[]): File[] {
        return files.filter((file) => {
            return this.allowedMimeTypes.hasOwnProperty(file.type) && file.size < MAX_DOCUMENT_SIZE;
        })
    }

    transformFilesToDisplayedDocuments(files: File[], collectionId: number): DisplayedListDocument[] {
        return files.map((file: File) => {
            const isValidType = this.allowedMimeTypes.hasOwnProperty(file.type);
            const isValidSize = file.size < MAX_DOCUMENT_SIZE;

            return {
                file_name: file.name,
                file_size: file.size,
                source_collection: collectionId,
                isValidType,
                isValidSize
            }
        });
    }

    filterDuplicatesByName(files: FileList): File[] {
        const arr: File[] = [];
        for (const file of Array.from(files)) {
            // Skip duplicates by name
            const hasDuplicates = arr.some(f => f.name === file.name);
            if (hasDuplicates) continue;

            arr.push(file);
        }
        return arr;
    }

    updateDocumentsAfterUpload(current: WritableSignal<DisplayedListDocument[]>, uploaded: CollectionDocument[]) {
        current.update((displayedDocs) => {
            return displayedDocs.map(doc => {
                const updated = uploaded.find(
                    d => d.file_name === doc.file_name &&
                        d.source_collection === doc.source_collection
                );

                if (!updated) return doc;

                return {
                    ...doc,
                    document_id: updated.document_id,
                    file_type: updated.file_type,
                    isValidType: true,
                    isValidSize: true
                };
            });
        });
    }
}
