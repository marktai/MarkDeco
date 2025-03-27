import { Injectable } from '@angular/core';
import { Time, Segment, Segments, PlanFactory,
    Options, Tank } from 'scuba-physics';
import { Strategies } from './models';

@Injectable()
export class Plan {
    private static readonly defaultDuration = Time.oneMinute * 10;
    // TODO move strategy to Consumption algorithm selection
    public strategy: Strategies = Strategies.ALL;
    private definedSegments: Segment[] = [];
    private impliedSegments: Segments = new Segments();

    constructor() {
    }

    public get length(): number {
        return this.impliedSegments.length;
    }

    public get minimumSegments(): boolean {
        return this.length > 1;
    }

    public get notEnoughTime(): boolean {
        return this.length === 2 && this.segments[1].duration === 0;
    }

    public get segments(): Segment[] {
        return this.impliedSegments.items;
    }

    public get maxDepth(): number {
        return this.impliedSegments.maxDepth;
    }

    public get startAscentIndex(): number {
        return this.impliedSegments.startAscentIndex;
    }

    public get startAscentTime(): number {
        return this.impliedSegments.startAscentTime;
    }

    /** in minutes */
    public get duration(): number {
        const seconds = this.impliedSegments.duration;
        return Time.toMinutes(seconds);
    }

    public get availablePressureRatio(): number {
        return this.strategy === Strategies.THIRD ? 2 / 3 : 1;
    }

    public get needsReturn(): boolean {
        return this.strategy !== Strategies.ALL;
    }

    public setSimple(depth: number, duration: number, tank: Tank, options: Options): void {
        this.impliedSegments = PlanFactory.createPlan(depth, duration, tank, options);
        this.definedSegments = this.impliedSegments.items;
    }

    public assignDepth(newDepth: number, tank: Tank, options: Options): void {
        this.impliedSegments = PlanFactory.createPlan(newDepth, this.duration, tank, options);
        this.definedSegments = this.impliedSegments.items;
    }

    public assignDuration(newDuration: number, tank: Tank, options: Options): void {
        this.impliedSegments = PlanFactory.createPlan(this.maxDepth, newDuration, tank, options);
    }

    public addSegment(tank: Tank): void {
        const last = this.definedSegments[this.definedSegments.length - 1];
        const newSegment = new Segment(last.startDepth, last.endDepth, tank.gas, Plan.defaultDuration);
        newSegment.tank = tank;
        this.definedSegments.push(newSegment);
    }

    public removeSegment(segment: Segment, descentSpeed: number, ascentSpeed: number): void {
        this.definedSegments = this.definedSegments.filter(s => s !== segment);
        this.fixDepths(descentSpeed, ascentSpeed);
    }

    // consider dirty check?
    public fixDepths(descentSpeed: number, ascentSpeed: number): void {
        if (this.definedSegments.length === 0){
            return;
        }

        this.impliedSegments.cutDown(this.impliedSegments.length);
        let lastDepth = 0;
        let lastSegment = this.definedSegments[0];
        for (const s of this.definedSegments){
            if (s.startDepth !== lastDepth){
                let duration: null|number = null;
                if(s.startDepth > lastDepth){
                    duration = (s.startDepth - lastDepth) * 60 / descentSpeed;
                } else {
                    duration = (lastDepth - s.startDepth) * 60 / ascentSpeed;
                }
                this.impliedSegments.add(s.startDepth, lastSegment.gas, duration);
                this.impliedSegments.last().tank = lastSegment.tank;
            }

            this.impliedSegments.add(s.endDepth, s.gas, s.duration);

            lastDepth = s.startDepth;
            lastSegment = s;
        }
    }

    // Note: caller must call fixDepths()
    public loadFrom(other: Segment[]): void {
        if (other.length <= 1) {
            return;
        }

        // TODO restore Strategy
        // this.strategy = other.strategy;
        // cant use copy, since deserialized objects wouldn't have one.
        this.definedSegments = other.slice();
    }

    // updates all segments to a different tank
    public resetSegments(removed: Tank, replacement: Tank): void {
        this.segments.forEach(segment => {
            if (segment.tank === removed) {
                segment.tank = replacement;
            }
        });
    }
}
