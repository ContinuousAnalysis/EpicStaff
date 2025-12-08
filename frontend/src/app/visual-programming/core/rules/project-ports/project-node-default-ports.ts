import { BasePort } from '../../models/port.model';

export const DEFAULT_PROJECT_NODE_PORTS: BasePort[] = [
    {
        port_type: 'input',
        role: 'project-in',
        multiple: true,
        label: 'In',
        allowedConnections: [
            'project-out',
            'python-out',
            'web-scraper-out',
            'edge-out',
            'start-start',
            'table-out',
            'file-extractor-out',
            'llm-out-right',
            'webhook-trigger-out',
        ],
        position: 'left',
        color: '#5672cd',
    },
    {
        port_type: 'output',
        role: 'project-out',
        multiple: false,
        label: 'Out',
        allowedConnections: [
            'project-in',
            'python-in',
            'web-scraper-in',
            'edge-in',
            'llm-out-left',
            'table-in',
            'file-extractor-in',
            'end-in',
            'webhook-trigger-in'
        ],
        position: 'right',
        color: '#5672cd',
    },
];
