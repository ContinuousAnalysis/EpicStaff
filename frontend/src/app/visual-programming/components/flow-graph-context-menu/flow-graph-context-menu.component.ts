import {
  ChangeDetectionStrategy,
  Component,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { NodeType } from '../../core/enums/node-type';
import { MenuType } from '../../core/enums/menu-type.enum';
import { FlowGraphCoreContextMenuComponent } from './flow-graph-core-context-menu/flow-graph-core-context-menu.component';
import { TemplatesContextMenuComponent } from './templates-context-menu/templates-context-menu.component';
import { LlmMenuComponent } from './llm-menu/llm-menu.component';

@Component({
  selector: 'app-flow-graph-context-menu',
  standalone: true,
  templateUrl: './flow-graph-context-menu.component.html',
  styleUrls: ['./flow-graph-context-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgStyle,
    FlowGraphCoreContextMenuComponent,
    TemplatesContextMenuComponent,
    LlmMenuComponent,
  ],
})
export class FlowGraphContextMenuComponent {
  @Input({ required: true })
  public position: { x: number; y: number } = { x: 0, y: 0 };

  @Output() public nodeSelected = new EventEmitter<{
    type: NodeType;
    data?: any;
  }>();

  @Output() public createNewProject = new EventEmitter<void>();

  public readonly MenuType = MenuType;

  public get topPosition(): number {
    return this.position.y - 80;
  }

  public get leftPosition(): number {
    return this.position.x - 70;
  }

  public searchTerm: string = '';

  public selectedMenu: MenuType = MenuType.FlowCore;

  public get menuItems(): { label: string; type: MenuType }[] {
    return [
      { label: 'Core', type: MenuType.FlowCore },
      { label: 'Templates', type: MenuType.Templates },
      // { label: 'Models', type: MenuType.Llms },
    ];
  }

  public get menuWidth(): string {
    if (this.selectedMenu === MenuType.FlowCore) {
      return 'auto';
    }
    return '380px';
  }

  public onSelectMenu(type: MenuType): void {
    this.selectedMenu = type;
  }

  public onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm = input.value;
  }

  public onNodeSelected(event: { type: NodeType; data: any }): void {
    console.log('Node selected:', event.data);
    this.nodeSelected.emit(event);
  }

  public onCreateNewProject(): void {
    this.createNewProject.emit();
  }
}
