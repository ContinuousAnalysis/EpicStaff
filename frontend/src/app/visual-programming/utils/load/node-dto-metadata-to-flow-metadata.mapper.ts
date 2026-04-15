import { NodeDtoMetadata } from '../../core/models/node-metadata.model';

const DEFAULT_POSITION = { x: 0, y: 0 };
const DEFAULT_COLOR = '#685fff';
const DEFAULT_ICON = 'ti ti-code';
const DEFAULT_SIZE = { width: 330, height: 60 };

export function mapNodeDtoMetadataToFlowNodeMetadata(
    metadata: Record<string, unknown> | undefined | null
): NodeDtoMetadata {
    const m = metadata ?? {};
    const position = m['position'] as { x?: number; y?: number } | undefined;
    const size = m['size'] as { width?: number; height?: number } | undefined;

    return {
        position: {
            x: position?.x ?? DEFAULT_POSITION.x,
            y: position?.y ?? DEFAULT_POSITION.y,
        },
        color: typeof m['color'] === 'string' ? m['color'] : DEFAULT_COLOR,
        icon: typeof m['icon'] === 'string' ? m['icon'] : DEFAULT_ICON,
        size: {
            width: size?.width ?? DEFAULT_SIZE.width,
            height: size?.height ?? DEFAULT_SIZE.height,
        },
        nodeNumber: typeof m['nodeNumber'] === 'number' ? m['nodeNumber'] : undefined,
    };
}
