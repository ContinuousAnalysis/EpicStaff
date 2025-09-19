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
            'edge-out',
            'start-start',
            'table-out',
            'file-extractor-out',
            'llm-out-right',
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
            'edge-in',
            'llm-out-left',
            'table-in',
            'file-extractor-in',
            'end-in',
        ],
        position: 'right',
        color: '#5672cd',
    },
];
