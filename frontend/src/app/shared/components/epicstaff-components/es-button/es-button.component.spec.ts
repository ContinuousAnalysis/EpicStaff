import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EsButtonComponent } from './es-button.component';

describe('EsButtonComponent', () => {
  let component: EsButtonComponent;
  let fixture: ComponentFixture<EsButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EsButtonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EsButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
