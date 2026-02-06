import { ChangeDetectionStrategy, Component, output } from '@angular/core';

@Component({
  selector: 'app-close-icon-button',
  standalone: true,
  template: `
    <button
      type="button"
      class="close-icon-button"
      (click)="onClick.emit()"
      aria-label="Close"
    >
      <i class="ti ti-x" aria-hidden="true"></i>
    </button>
  `,
  styles: [
    `
      .close-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 1px solid var(
          --configure-models-dialog-inactive-color,
          #685fff
        );
        border-radius: 50%;
        cursor: pointer;
        padding: 0;
        transition: all 0.2s ease;
        background-color: transparent;

        i {
          font-size: 16px;
          line-height: 1;
          color: var(
            --configure-models-dialog-inactive-color,
            #685fff
          );
        }

        &:hover {
          border-color: var(
            --configure-models-dialog-active-color,
            #d9d9de
          );

          i {
            color: var(
              --configure-models-dialog-active-color,
              #685fff
            );
          }
        }

        &:active {
          
          transform: scale(0.95);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloseIconButtonComponent {
  public readonly onClick = output<void>();
}

