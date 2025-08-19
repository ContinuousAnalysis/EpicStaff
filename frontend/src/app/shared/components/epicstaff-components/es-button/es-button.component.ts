import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-es-button',
  imports: [
    ButtonModule,
    TooltipModule,
    RouterLink,

    CommonModule,
  ],
  standalone: true,
  template: `
    <p-button
      [icon]="icon()"
      [routerLink]="routerLink() || null"
      [pTooltip]="tooltip()"
      (onClick)="onClick.emit($event)"
    />
  `,
  styles: [``],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EsButtonComponent {
  public icon = input<string>('');

  public tooltip = input<string>('');
  public routerLink = input<string | null>(null);

  public onClick = output<Event>();
}
