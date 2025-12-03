import { Component, input } from '@angular/core';
import {NgClass, NgStyle} from '@angular/common';

@Component({
    selector: 'app-stepper',
    imports: [NgClass, NgStyle],
    templateUrl: './stepper.component.html',
    styleUrls: ['./stepper.component.scss'],
})
export class StepperComponent {
    steps = input<string[]>([]);

    currentStep = input<number>(0);
}
