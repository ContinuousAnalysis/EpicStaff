import { NodeType } from '../enums/node-type';
import { NodeModel } from '../models/node.model';
import { NODE_TYPE_PREFIXES } from '../enums/node-type-prefixes';

/**
 * Generate a display name for a node, following the same rules as onAddNodeFromContextMenu.
 * @param type NodeType
 * @param data Optional node data (may contain name for PROJECT)
 * @param currentNodes All current nodes in the flow (for counting)
 */
export function generateNodeDisplayName(
  type: NodeType,
  data: any,
  currentNodes: NodeModel[]
): string {
  if (type === NodeType.PROJECT) {
    const projectName = data?.name || 'My Project';
    const count =
      currentNodes.filter((n) => n.type === NodeType.PROJECT).length + 1;
    return `${projectName} (#${count})`;
  } else {
    const prefix = NODE_TYPE_PREFIXES[type] || 'Node';
    const count = currentNodes.filter((n) => n.type === type).length + 1;
    return `${prefix} (#${count})`;
  }
}

/**
 * Generate display names for multiple nodes at once, ensuring each gets a unique count.
 * This is useful when creating multiple nodes simultaneously (like in copy/paste operations).
 * @param nodesToCreate Array of nodes to create with their types and data
 * @param currentNodes All current nodes in the flow (for counting)
 * @returns Array of display names in the same order as nodesToCreate
 */
export function generateMultipleNodeDisplayNames(
  nodesToCreate: Array<{ type: NodeType; data: any }>,
  currentNodes: NodeModel[]
): string[] {
  // Count existing nodes by type
  const existingCounts = new Map<NodeType, number>();
  currentNodes.forEach((node) => {
    existingCounts.set(node.type, (existingCounts.get(node.type) || 0) + 1);
  });

  // Count nodes being created by type
  const creatingCounts = new Map<NodeType, number>();
  nodesToCreate.forEach((node) => {
    creatingCounts.set(node.type, (creatingCounts.get(node.type) || 0) + 1);
  });

  // Generate names for each node
  const displayNames: string[] = [];
  const tempCounts = new Map<NodeType, number>();

  nodesToCreate.forEach((node, index) => {
    const type = node.type;
    const data = node.data;

    // Get current count for this type (existing + already created in this batch)
    const existingCount = existingCounts.get(type) || 0;
    const tempCount = tempCounts.get(type) || 0;
    const currentCount = existingCount + tempCount + 1;

    // Update temp count for next iteration
    tempCounts.set(type, tempCount + 1);

    if (type === NodeType.PROJECT) {
      const projectName = data?.name || 'My Project';
      displayNames[index] = `${projectName} (#${currentCount})`;
    } else {
      const prefix = NODE_TYPE_PREFIXES[type] || 'Node';
      displayNames[index] = `${prefix} (#${currentCount})`;
    }
  });

  return displayNames;
}
