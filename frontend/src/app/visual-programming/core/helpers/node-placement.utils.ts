import { IPoint } from '@foblex/2d';

import { NodeType } from '../enums/node-type';
import { DecisionTableNodeModel, NodeModel } from '../models/node.model';
import { getDecisionTableVisualHeight } from './node-size.util';

export interface CollisionBounds {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
}

export const GRID_CELL_SIZE = 20;

const MAX_SEARCH_RADIUS = 40;

export function snapToGrid(value: number): number {
    return Math.round(value / GRID_CELL_SIZE) * GRID_CELL_SIZE;
}

export function snapPointToGrid(point: IPoint): IPoint {
    return {
        x: snapToGrid(point.x),
        y: snapToGrid(point.y),
    };
}

export function getCollisionBounds(node: Pick<NodeModel, 'type' | 'size' | 'data'>): CollisionBounds {
    switch (node.type) {
        case NodeType.EDGE:
            return { width: 308, height: 196, offsetX: 5, offsetY: -12 };

        case NodeType.TABLE: {
            const conditionGroups = (node as DecisionTableNodeModel).data.table?.condition_groups ?? [];
            return {
                width: node.size.width + 8,
                height: getDecisionTableVisualHeight(conditionGroups) + 68,
                offsetX: -4,
                offsetY: -4,
            };
        }

        default:
            return {
                width: node.size.width + 10,
                height: node.size.height + 10,
                offsetX: -5,
                offsetY: -5,
            };
    }
}

export function findNearestFreePosition(proposed: IPoint, bounds: CollisionBounds, otherNodes: NodeModel[]): IPoint {
    const overlaps = (pos: IPoint) =>
        otherNodes.some((n) => rectOverlaps(pos, bounds, n.position, getCollisionBounds(n)));

    if (!overlaps(proposed)) return proposed;

    const candidates: Array<[number, number]> = [];
    for (let dx = -MAX_SEARCH_RADIUS; dx <= MAX_SEARCH_RADIUS; dx++) {
        for (let dy = -MAX_SEARCH_RADIUS; dy <= MAX_SEARCH_RADIUS; dy++) {
            if (dx === 0 && dy === 0) continue;
            candidates.push([dx, dy]);
        }
    }
    candidates.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));

    for (const [dx, dy] of candidates) {
        const candidate: IPoint = {
            x: proposed.x + dx * GRID_CELL_SIZE,
            y: proposed.y + dy * GRID_CELL_SIZE,
        };
        if (!overlaps(candidate)) return candidate;
    }

    return proposed;
}

export function resolveOverlapsForNode(anchorId: string, allNodes: NodeModel[]): NodeModel[] {
    const anchor = allNodes.find((n) => n.id === anchorId);
    if (!anchor) return [];

    const anchorBounds = getCollisionBounds(anchor);
    const workingNodes = [...allNodes];
    const movedNodes: NodeModel[] = [];

    const sortedOthers = workingNodes.filter((n) => n.id !== anchorId).sort((a, b) => a.position.y - b.position.y);

    for (const node of sortedOthers) {
        const isOverlapping = rectOverlaps(node.position, getCollisionBounds(node), anchor.position, anchorBounds);
        if (!isOverlapping) continue;

        const freePos = findNearestFreePosition(
            node.position,
            getCollisionBounds(node),
            workingNodes.filter((n) => n.id !== node.id)
        );

        if (freePos.x !== node.position.x || freePos.y !== node.position.y) {
            const updatedNode = { ...node, position: freePos };
            const idx = workingNodes.findIndex((n) => n.id === node.id);
            workingNodes[idx] = updatedNode;
            movedNodes.push(updatedNode);
        }
    }

    return movedNodes;
}

function rectOverlaps(aPos: IPoint, aBounds: CollisionBounds, bPos: IPoint, bBounds: CollisionBounds): boolean {
    const aLeft = aPos.x + aBounds.offsetX;
    const aTop = aPos.y + aBounds.offsetY;
    const aRight = aLeft + aBounds.width;
    const aBottom = aTop + aBounds.height;

    const bLeft = bPos.x + bBounds.offsetX;
    const bTop = bPos.y + bBounds.offsetY;
    const bRight = bLeft + bBounds.width;
    const bBottom = bTop + bBounds.height;

    return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
}
