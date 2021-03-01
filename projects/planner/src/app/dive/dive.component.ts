import { Component, OnInit } from '@angular/core';
import { PlannerService } from '../shared/planner.service';
import { Dive } from '../shared/models';
import { faExclamationCircle, faExclamationTriangle, faTasks } from '@fortawesome/free-solid-svg-icons';
import { EventType, Event, Time, Tank } from 'scuba-physics';

@Component({
  selector: 'app-dive',
  templateUrl: './dive.component.html',
  styleUrls: ['./dive.component.css']
})
export class DiveComponent implements OnInit {
  public dive: Dive;
  public bottomTank: Tank;
  public exclamation = faExclamationCircle;
  public warning = faExclamationTriangle;
  public tasks = faTasks;

  public get needsReturn(): boolean {
    return this.planer.plan.needsReturn;
  }

  public get gasMod(): number {
    return this.planer.gasMod;
  }

  public get noDeco(): number {
    return this.planer.plan.noDecoTime;
  }

  public get descentDuration(): number {
    const diveDescent = Time.toMinutes(this.dive.descent.duration);
    return Math.ceil(diveDescent);
  }

  constructor(private planer: PlannerService) { }

  ngOnInit() {
    this.dive = this.planer.dive;
    this.bottomTank = this.planer.firstTank;
  }

  public isHighPpO2(event: Event): boolean {
    return event.type === EventType.highPpO2;
  }
}
