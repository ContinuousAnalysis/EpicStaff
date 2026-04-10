export type TerminalLogType = 'info' | 'polling' | 'stdout' | 'stderr' | 'result' | 'error';

export interface TerminalLogEntry {
    timestamp: Date;
    type: TerminalLogType;
    message: string;
}
