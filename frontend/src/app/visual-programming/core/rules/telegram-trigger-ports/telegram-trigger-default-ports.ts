import {BasePort} from "../../models/port.model";

export const DEFAULT_TELEGRAM_TRIGGER_NODE_PORTS: BasePort[] = [
    {
        port_type: 'input',
        role: 'telegram-trigger-in',
        multiple: true,
        label: 'In',
        allowedConnections: [
            'project-out',
            'python-out',
            'edge-out',
            'start-start',
            'table-out',
            'llm-out-right',
            'file-extractor-out',
            'subgraph-out',
            'audio-to-text-out',
            'webhook-trigger-out',
            'telegram-trigger-out',
        ],
        position: 'left',
        color: '#229ED9',
    },

    {
        port_type: 'output',
        role: 'telegram-trigger-out',
        multiple: false,
        label: 'Out',
        allowedConnections: [
            'project-in',
            'python-in',
            'edge-in',
            'table-in',
            'llm-out-left',
            'file-extractor-in',
            'subgraph-in',
            'webhook-trigger-in',
            'telegram-trigger-in',
            'audio-to-text-in',
            'end-in',
        ],
        position: 'right',
        color: '#229ED9',
    },
];
