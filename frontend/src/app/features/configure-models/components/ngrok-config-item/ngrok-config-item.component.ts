import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AppSvgIconComponent, ButtonComponent, IconButtonComponent } from '@shared/components';
import { GetNgrokConfigResponse } from '@shared/models';

@Component({
    selector: 'app-ngrok-config-item',
    imports: [CommonModule, IconButtonComponent, ButtonComponent, AppSvgIconComponent],
    templateUrl: './ngrok-config-item.component.html',
    styleUrls: ['./ngrok-config-item.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgrokConfigItemComponent {
    config = input.required<GetNgrokConfigResponse>();

    configureClicked = output<void>();
    deleteClicked = output<void>();

    public onConfigure(): void {
        this.configureClicked.emit();
    }

    public onDelete(): void {
        this.deleteClicked.emit();
    }
}
