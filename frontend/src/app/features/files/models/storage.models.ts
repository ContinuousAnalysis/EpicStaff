export interface StorageItem {
    name: string;
    path: string;
    type: 'file' | 'folder';
    size?: number;
    modified?: string;
    children?: StorageItem[];
    isExpanded?: boolean;
}

export interface StorageItemInfo extends StorageItem {
    content_type?: string;
    created?: string;
    etag?: string;
}

export interface StorageUploadResponse {
    path: string;
    size: number;
}

export interface StorageArchiveResponse {
    extracted: string[];
}

export interface StorageSessionOutput {
    path: string;
    size: number;
    created: string;
}
