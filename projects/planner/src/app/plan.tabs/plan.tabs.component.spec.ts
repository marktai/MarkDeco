import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlanTabsComponent } from './plan.tabs.component';
import { DiveSchedules } from '../shared/dive.schedules';
import { UnitConversion } from '../shared/UnitConversion';

describe('PlanTabsComponent', () => {
    let component: PlanTabsComponent;
    let fixture: ComponentFixture<PlanTabsComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [PlanTabsComponent],
            providers: [
                DiveSchedules, UnitConversion,
            ]
        });
        fixture = TestBed.createComponent(PlanTabsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
