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
    console.log('=== GENERATE MULTIPLE NODE DISPLAY NAMES DEBUG ===');
    console.log('Input nodesToCreate:', nodesToCreate);
    console.log(
        'Input currentNodes:',
        currentNodes.map((n) => ({ id: n.id, type: n.type, name: n.node_name }))
    );

    // Get all existing node names to avoid duplicates
    const existingNames = new Set(currentNodes.map((n) => n.node_name));
    console.log('Existing node names:', Array.from(existingNames));

    // Count existing nodes by type
    const existingCounts = new Map<NodeType, number>();
    currentNodes.forEach((node) => {
        existingCounts.set(node.type, (existingCounts.get(node.type) || 0) + 1);
    });
    console.log('Existing counts by type:', Object.fromEntries(existingCounts));

    // Count nodes being created by type
    const creatingCounts = new Map<NodeType, number>();
    nodesToCreate.forEach((node) => {
        creatingCounts.set(node.type, (creatingCounts.get(node.type) || 0) + 1);
    });
    console.log('Creating counts by type:', Object.fromEntries(creatingCounts));

    // Generate names for each node
    const displayNames: string[] = [];
    const tempCounts = new Map<NodeType, number>();
    const generatedNames = new Set<string>(); // Track names generated in this batch

    nodesToCreate.forEach((node, index) => {
        const type = node.type;
        const data = node.data;

        // Get current count for this type (existing + already created in this batch)
        const existingCount = existingCounts.get(type) || 0;
        const tempCount = tempCounts.get(type) || 0;
        let currentCount = existingCount + tempCount + 1;

        console.log(
            `Node ${index} (${type}): existingCount=${existingCount}, tempCount=${tempCount}, initialCount=${currentCount}`
        );

        // Generate name and ensure it's unique
        let displayName: string;
        let attempts = 0;
        const maxAttempts = 1000; // Increased to handle more complex scenarios

        do {
            if (type === NodeType.PROJECT) {
                const projectName = data?.name || 'My Project';
                displayName = `${projectName} (#${currentCount})`;
            } else {
                const prefix = NODE_TYPE_PREFIXES[type] || 'Node';
                displayName = `${prefix} (#${currentCount})`;
            }

            // Check if this name already exists or was generated in this batch
            if (
                !existingNames.has(displayName) &&
                !generatedNames.has(displayName)
            ) {
                break; // Name is unique
            }

            currentCount++;
            attempts++;
            console.log(
                `Name "${displayName}" already exists, trying count ${currentCount}`
            );
        } while (attempts < maxAttempts);

        if (attempts >= maxAttempts) {
            console.error(
                `Could not generate unique name for node ${index} after ${maxAttempts} attempts`
            );
            // More robust fallback name with timestamp and random component
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            displayName = `${type}_${timestamp}_${randomSuffix}`;
        }

        // Add to generated names set
        generatedNames.add(displayName);
        displayNames[index] = displayName;

        // Update temp count for next iteration
        tempCounts.set(type, tempCount + 1);

        console.log(`Generated name for node ${index}: "${displayName}"`);
    });

    console.log('Final display names:', displayNames);
    console.log('=== END GENERATE MULTIPLE NODE DISPLAY NAMES DEBUG ===');
    return displayNames;
}
