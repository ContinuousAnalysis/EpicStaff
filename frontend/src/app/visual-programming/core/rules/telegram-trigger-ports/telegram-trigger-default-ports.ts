import {BasePort} from "../../models/port.model";

export const DEFAULT_TELEGRAM_TRIGGER_NODE_PORTS: BasePort[] = [

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
            'webhook-trigger',
            'end-in',
        ],
        position: 'right',
        color: '#229ED9',
    },
];
