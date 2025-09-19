import { InputSignal, OutputEmitterRef } from '@angular/core';
import { NodeModel } from './node.model';

/**
 * A generic, signal-based interface that defines the public contract for any side panel component.
 * It uses a generic type 'T' to ensure type safety between the specific node model and the panel.
 */
export interface NodePanel<T extends NodeModel = NodeModel> {
    /**
     * Every panel MUST accept a 'node' as a signal input.
     * The type 'T' ensures that if a panel is for a 'PythonNode', its input is specifically
     * an InputSignal<PythonNodeModel>.
     */
    node: InputSignal<T>;

    /**
     * Every panel MUST have a 'save' event output.
     * This is the modern equivalent of `@Output() save`.
     */
    save: OutputEmitterRef<NodeModel>;
}
