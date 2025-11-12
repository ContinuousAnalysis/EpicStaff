import { BasePort } from '../../models/port.model';

export const DEFAULT_WEBHOOK_TRIGGER_NODE_PORTS: BasePort[] = [
    {
        port_type: 'input',
        role: 'webhook-trigger-in',
        multiple: true,
        label: 'In',
        allowedConnections: [
            'project-out',
            'python-out',
            'edge-out',
            'table-out',
            'llm-out-right',
            'file-extractor-out',
            'webhook-trigger-out'
        ],
        position: 'left',
        color: '#21f367ff',
    },

    {
        port_type: 'output',
        role: 'webhook-trigger-out',
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
        color: '#21f367ff',
    },
];
