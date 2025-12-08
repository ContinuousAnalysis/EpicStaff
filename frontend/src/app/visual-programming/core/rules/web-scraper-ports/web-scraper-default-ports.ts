import { BasePort } from '../../models/port.model';

export const DEFAULT_WEB_SCRAPER_NODE_PORTS: BasePort[] = [
    {
        port_type: 'input',
        role: 'web-scraper-in',
        multiple: true,
        label: 'In',
        allowedConnections: [
            'project-out',
            'python-out',
            'edge-out',
            'table-out',
            'start-start',
            'llm-out-right',
            'file-extractor-out',
            'webhook-trigger-out',
            'web-scraper-out',
        ],
        position: 'left',
        color: '#ff9800',
    },
    {
        port_type: 'output',
        role: 'web-scraper-out',
        multiple: false,
        label: 'Out',
        allowedConnections: [
            'project-in',
            'python-in',
            'edge-in',
            'table-in',
            'llm-out-left',
            'file-extractor-in',
            'webhook-trigger-in',
            'end-in',
            'web-scraper-in',
        ],
        position: 'right',
        color: '#ff9800',
    },
];

