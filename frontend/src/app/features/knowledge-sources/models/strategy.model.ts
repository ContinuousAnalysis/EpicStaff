import {ChunkStrategy} from "../enums/chunk-strategy";

export interface BaseStrategyModel {
   strategy: ChunkStrategy;
}

export interface MarkdownStrategyModel extends BaseStrategyModel {
    chunk_size: number;
    chunk_overlap: number;
    headers_to_split_on: string[];
    return_each_line: boolean;
    strip_headers: boolean;
}

export interface CharacterStrategyModel extends BaseStrategyModel {
    chunk_size: number;
    chunk_overlap: number;
    regex: string;
}

export interface CsvStrategyModel extends BaseStrategyModel {
    rows_in_chunk: number;
    headers_level: number;
}

export interface HtmlStrategyModel extends BaseStrategyModel {
    chunk_size: number;
    chunk_overlap: number;
    preserve_links: boolean;
    normalize_text: boolean;
    external_metadata: string;
    denylist_tags: string;
}

export interface TokenStrategyModel extends BaseStrategyModel {
    chunk_size: number;
    chunk_overlap: number;
}

export interface JsonStrategyModel extends BaseStrategyModel {
    chunk_size: number;
}

export type StrategyModel =
    | MarkdownStrategyModel
    | CharacterStrategyModel
    | HtmlStrategyModel
    | TokenStrategyModel
    | JsonStrategyModel
    | CsvStrategyModel
