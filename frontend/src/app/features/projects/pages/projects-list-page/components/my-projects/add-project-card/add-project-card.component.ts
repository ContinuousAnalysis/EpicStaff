import {
    Component,
    ChangeDetectionStrategy,
    Output,
    EventEmitter,
} from '@angular/core';

import { CardModule } from 'primeng/card';

@Component({
    selector: 'app-add-project-card',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CardModule],
    template: `
        <p-card (click)="createClick.emit()" class="add-project-card">
            <div class="content">
                <div class="plus-icon">
                    <i class="pi pi-plus"></i>
                </div>
                <div class="title">Create New Project</div>
            </div>
        </p-card>
    `,
    styles: [
        `
            :host ::ng-deep .add-project-card {
                cursor: pointer;
                height: 165px;

                .p-card {
                    height: 100%;
                    border: 1px dashed rgba(255, 255, 255, 0.2);
                    background: transparent;
                    transition: all 0.2s ease;
                }

                .p-card:hover {
                    border-color: var(--accent-color);
                }

                .p-card-body {
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
            }

            .content {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                gap: 1rem;
            }

            .plus-icon {
                width: 60px;
                height: 60px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);

                i {
                    font-size: 2rem;
                    color: var(--accent-color);
                }
            }

            .title {
                font-size: 16px;
                font-weight: 500;
                color: var(--color-text-secondary);
                transition: color 0.2s ease;
            }

            :host ::ng-deep .add-project-card:hover .title {
                color: var(--color-text-primary);
            }
        `,
    ],
})
export class AddProjectCardComponent {
    @Output() public createClick = new EventEmitter();
}
