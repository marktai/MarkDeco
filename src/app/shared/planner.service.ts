import { Injectable } from '@angular/core';
import { Plan, Diver, Dive, Gas, SafetyStop } from './models';
import { DepthConverterService } from './depth-converter.service';
import { NitroxCalculatorService } from './nitrox-calculator.service';
import { WayPointsService } from './waypoints.service';

@Injectable()
export class PlannerService {
  public plan: Plan = new Plan(20, 30, 1);
  public diver: Diver = new Diver(20, 1.4);
  public gas: Gas = new Gas(15, 21, 200);
  public dive: Dive = new Dive();

  public get gasMod(): number {
    return NitroxCalculatorService.calculateMod(this.diver.maxPpO2, this.gas.o2);
  }

  public calculate() {
    const averagePressure = this.averagePressure();
    const timeToSurface = this.calculateTimeToSurface();
    const rockBottom = this.calculateRockBottom(timeToSurface, averagePressure);
    const availableVolume = this.availableVolume(rockBottom);

    this.dive.timeToSurface = timeToSurface;
    this.dive.rockBottom = rockBottom;
    this.dive.maxTime = this.calculateMaxDiveTime(averagePressure, availableVolume);
    this.gas.consumed = this.calculateConsumed(this.plan.duration,
      this.diver.sac, averagePressure, this.gas.size);

    this.dive.wayPoints = WayPointsService.calculateWayPoints(this.plan);
    this.dive.turnPressure = this.calculateTurnPressure();
    this.dive.turnTime = Math.floor(this.plan.duration / 2);
    this.dive.needsReturn = this.plan.needsReturn;
    this.dive.notEnoughGas = this.gas.endPressure < this.dive.rockBottom;
    this.dive.depthExceeded = this.plan.depth > this.gasMod;
    this.dive.notEnoughTime = this.plan.duration <= this.dive.timeToSurface;
    this.dive.calculated = true;
  }

  private calculateTurnPressure(): number {
    const consumed = this.gas.consumed / 2;
    return this.gas.startPressure - Math.floor(consumed);
  }

  private calculateMaxDiveTime(averagePressure: number, availableVolume: number): number {
    const result = availableVolume / averagePressure / this.diver.sac;
    return Math.floor(result);
  }

  private availableVolume(rockBottom: number): number {
    const totalVolume = this.gas.volume;
    const usablePart = this.plan.availablePressureRatio;
    return (totalVolume - rockBottom * this.gas.size) * usablePart;
  }

  private calculateRockBottom(timeToSurface: number, averagePressure: number): number {
    const minimumRockBottom = 30;
    const stressSac = this.diver.stressSac;
    const result = this.calculateConsumed(timeToSurface, stressSac, averagePressure, this.gas.size);
    return result > minimumRockBottom ? result : minimumRockBottom;
  }

  private calculateConsumed(time: number, sac: number, averagePressure: number, gasSize): number {
    const result = time * averagePressure * Diver.gasSac(sac, gasSize);
    const rounded = Math.ceil(result);
    return rounded;
  }

  private averagePressure(): number {
    const averageDepth = this.plan.depth / 2;
    return DepthConverterService.toAtm(averageDepth);
  }

  private calculateTimeToSurface(): number {
    const solutionDuration = 2;
    const safetyStop = this.plan.needsSafetyStop ? SafetyStop.duration : 0;
    const swimTime = Math.ceil(this.plan.depth /  Diver.ascSpeed);
    return solutionDuration + swimTime + safetyStop;
  }

  public loadFrom(other: PlannerService): void {
    if (!other) {
      return;
    }

    this.plan.loadFrom(other.plan);
    this.diver.loadFrom(other.diver);
    // cant use firstGas from the other, since it doesn't have to be deserialized
    this.gas.loadFrom(other.gas);
  }
}
