import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { faBatteryEmpty, faTrashAlt, faPlusSquare } from '@fortawesome/free-solid-svg-icons';

import { PlannerService } from '../shared/planner.service';
import { Gases, Gas, Diver } from '../shared/models';

@Component({
  selector: 'app-gases',
  templateUrl: './gases.component.html',
  styleUrls: ['./gases.component.css']
})
export class GasesComponent implements OnInit {
  private diver: Diver;
  public gas: Gas;
  public gasNames: string[];
  public bottleIcon = faBatteryEmpty;
  public plusIcon = faPlusSquare;
  public trashIcon = faTrashAlt;
  constructor(private planner: PlannerService) { }

  @Output() validate: EventEmitter<any> = new EventEmitter();

  ngOnInit() {
    this.gas = this.planner.firstGas;
    this.diver = this.planner.diver;
    this.gasNames = Gases.gasNames();
  }

  public get isTechnical(): boolean {
    return this.planner.isTechnical;
  }

  public get o2(): number {
    return this.gas.o2;
  }

  public set o2(newValue) {
    this.gas.o2 = newValue;
    this.planner.updateNoDecoTime();
  }

  public gasSac(gas: Gas): number {
    return this.diver.gasSac(gas);
  }
}
