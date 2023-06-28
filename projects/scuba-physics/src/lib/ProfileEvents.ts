import { Options } from './Options';
import { DepthConverter, DepthConverterFactory } from './depth-converter';
import { Ceiling, EventsFactory, Events } from './Profile';
import { Segment, Segments } from './Segments';
import { Time } from './Time';
import { AscentSpeeds } from './speeds';
import { Precision } from './precision';
import { DensityAtDepth } from './GasDensity';

/** all values in bar */
class PressureSegment {
    constructor(
        public startDepth: number,
        public endDepth: number,
        public duration: number
    ) { }

    public get minDepth(): number {
        return Math.min(this.startDepth, this.endDepth);
    }

    public get maxDepth(): number {
        return Math.max(this.startDepth, this.endDepth);
    }

    public get isDescent(): boolean {
        return this.startDepth < this.endDepth;
    }

    public get isFlat(): boolean {
        return this.startDepth === this.endDepth;
    }

    public get isAscent(): boolean {
        return this.startDepth > this.endDepth;
    }

    public timeAt(currentDepth: number): number {
        const speed = Segment.speed(this.startDepth, this.endDepth, this.duration);
        const time = Segment.timeAt(this.startDepth, speed, currentDepth);
        return Precision.round(time);
    }
}

class EventsContext {
    /** because of UI, e.g. depths for MOD, user wants to see well known values like 6 m MOD for oxygen */
    public simpleDepths: DepthConverter = DepthConverter.simple();
    /** for exact measures like density */
    public exactDepths: DepthConverter;
    public densityAtDepth: DensityAtDepth;
    public events: Events = new Events();
    public speeds: AscentSpeeds;
    /** total duration in seconds at beginning of current segment */
    public elapsed = 0;
    public index = 0;
    public fixedMnd = true;
    private _mndBars = 0;

    constructor(private startAscentIndex: number, private profile: Segment[],
        public options: Options) {
        this.exactDepths = new DepthConverterFactory(this.options).create();
        this.densityAtDepth = new DensityAtDepth(this.exactDepths);
        this.speeds = new AscentSpeeds(options);
        const segments = Segments.fromCollection(profile);
        this.speeds.markAverageDepth(segments);
        this._mndBars = this.simpleDepths.toBar(options.maxEND);
    }

    public get previous(): Segment | null {
        if (this.index > 0) {
            return this.profile[this.index - 1];
        }

        return null;
    }

    public get isBeforeDecoAscent(): boolean {
        return this.index < this.startAscentIndex;
    }

    public get maxPpo(): number {
        if (this.isBeforeDecoAscent) {
            return this.options.maxPpO2;
        }

        return this.options.maxDecoPpO2;
    }

    public get current(): Segment {
        return this.profile[this.index];
    }

    public get switchingGas(): boolean {
        return !!this.previous && !this.current.gas.compositionEquals(this.previous.gas);
    }

    /** Tank is only assigned by user */
    public get switchingTank(): boolean {
        return !!this.previous && !!this.previous.tank && !!this.current.tank &&
            this.previous.tank !== this.current.tank;
    }

    /** Gets maximum narcotic depth in bars */
    public get maxMnd(): number {
        return this._mndBars;
    }

    public get currentEndTime(): number {
        return this.elapsed + this.current.duration;
    }

    /** For depth in bars calculates the current equivalent narcotic depth in bars */
    public gasEnd(depth: number): number {
        const gas = this.current.gas;
        const oxygenNarcotic = this.options.oxygenNarcotic;
        return gas.end(depth, oxygenNarcotic);
    }

    public addElapsed(): void {
        this.elapsed = this.currentEndTime;
    }
}

export interface EventOptions {
    /** Maximum gas density in gram per liter. Defaults is 5.5 g/l */
    maxDensity: number;

    /**
     * startAscentIndex Number of segments from beginning to count as dive, later segments are considered as decompression ascent
     * E.g. In case of simple profile with 3 segments, only the last one is ascent, so this value is 2.
     */
    startAscentIndex: number;

    /** profile Complete list profile segments as user defined + calculated ascent */
    profile: Segment[];

    /** Ceilings for the associated profile */
    ceilings: Ceiling[];

    /** options User options used to create the profile */
    profileOptions: Options;
}

/** Creates events from profile generated by the algorithm */
export class ProfileEvents {
    /**
     * Generates events for calculated profile
     */
    public static fromProfile(eventOptions: EventOptions): Events {
        const context = new EventsContext(eventOptions.startAscentIndex, eventOptions.profile, eventOptions.profileOptions);
        const ceilingContext = new BrokenCeilingContext(context.events);

        for (context.index = 0; context.index < eventOptions.profile.length; context.index++) {
            // nice to have calculate exact time and depth of the events, it is enough it happened
            const pressureSegment = this.toPressureSegment(context.current, context.simpleDepths);
            this.addHighPpO2(context, pressureSegment);
            this.addLowPpO2(context, pressureSegment);
            this.addGasSwitch(context);
            this.addUserTankSwitch(context);
            this.addHighDescentSpeed(context);
            this.addHighAscentSpeed(context);
            this.addSwitchHighN2(context);
            this.addMndExceeded(context, pressureSegment);
            this.addDensityExceeded(context);

            ceilingContext.assignSegment(context.current);
            ProfileEvents.addBrokenCeiling(ceilingContext, eventOptions.ceilings, context.current);

            context.addElapsed();
        }

        return context.events;
    }

    private static addHighAscentSpeed(context: EventsContext) {
        const current = context.current;
        // Prevent events generated by precise numbers, it is safe because segments are generated with higher precision
        // this doesn't happen for descent, because it is never automatically calculated
        let speed = Time.toSeconds(current.speed);
        speed = Precision.roundTwoDecimals(speed);

        // ascent speed is negative number
        if (-speed > context.speeds.ascent(current.startDepth)) {
            const event = EventsFactory.createHighAscentSpeed(context.elapsed, current.startDepth);
            context.events.add(event);
        }
    }

    private static addHighDescentSpeed(context: EventsContext) {
        const current = context.current;
        const speed = Time.toSeconds(current.speed);

        if (speed > context.options.descentSpeed) {
            const event = EventsFactory.createHighDescentSpeed(context.elapsed, current.startDepth);
            context.events.add(event);
        }
    }

    private static addGasSwitch(context: EventsContext): void {
        if (context.switchingGas) {
            const current = context.current;
            const event = EventsFactory.createGasSwitch(context.elapsed, current.startDepth, current.gas);
            context.events.add(event);
        }
    }

    private static addUserTankSwitch(context: EventsContext): void {
        if (context.switchingTank) {
            const current = context.current;
            const event = EventsFactory.createGasSwitch(context.elapsed, current.startDepth, current.gas);
            context.events.add(event);
        }
    }

    private static toPressureSegment(segment: Segment, depthConverter: DepthConverter) {
        const startPressure = depthConverter.toBar(segment.startDepth);
        const endPressure = depthConverter.toBar(segment.endDepth);
        return new PressureSegment(startPressure, endPressure, segment.duration);
    }

    private static addHighPpO2(context: EventsContext, segment: PressureSegment): void {
        // non user defined gas switches are never to high ppO2 - see gases.bestGas
        // otherwise we don't know which ppO2 level to use
        if (segment.isDescent || (context.isBeforeDecoAscent && context.switchingGas)) {
            const gasMod = context.current.gas.mod(context.maxPpo);

            if (segment.maxDepth > gasMod) {
                let highDepth = segment.startDepth; // gas switch
                let timeStamp = context.elapsed;

                if (segment.startDepth < gasMod) { // ascent
                    highDepth = gasMod;
                    timeStamp += segment.timeAt(highDepth);
                }

                const depth = context.simpleDepths.fromBar(highDepth);
                const event = EventsFactory.createHighPpO2(timeStamp, depth);
                context.events.add(event);
            }
        }
    }

    private static addLowPpO2(context: EventsContext, segment: PressureSegment): void {
        const gasCeiling = context.current.gas.ceiling(context.simpleDepths.surfacePressure);
        const shouldAdd = (segment.minDepth < gasCeiling && context.switchingGas) ||
            (segment.startDepth > gasCeiling && gasCeiling > segment.endDepth && segment.isAscent) ||
            // only at beginning of a dive
            (context.current.startDepth === 0 && segment.startDepth < gasCeiling && segment.isDescent);

        if (shouldAdd) {
            // start of dive or gas switch
            let lowDepth = segment.startDepth;
            let timeStamp = context.elapsed;

            if (segment.startDepth > gasCeiling) { // ascent
                lowDepth = gasCeiling;
                timeStamp += segment.timeAt(lowDepth);
            }

            const depth = context.simpleDepths.fromBar(lowDepth);
            const event = EventsFactory.createLowPpO2(timeStamp, depth);
            context.events.add(event);
        }
    }

    /** Check only user defined segments break ceiling, because we trust the algorithm never breaks ceiling */
    private static addBrokenCeiling(context: BrokenCeilingContext, ceilings: Ceiling[], segment: Segment): void {
        while (context.lastCeilingIndex < context.currentSegmentEndTime && context.lastCeilingIndex < ceilings.length - 1) {
            const ceiling = ceilings[context.lastCeilingIndex];
            context.lastCeilingIndex++;

            const ceilingOk = context.belowCeiling(ceiling, segment);
            if (!ceilingOk && context.fixedBrokenCeiling) {
                const event = EventsFactory.createBrokenCeiling(ceiling.time, ceiling.depth);
                context.events.add(event);
                context.fixedBrokenCeiling = false;
                break;
            }

            if (ceilingOk && !context.fixedBrokenCeiling) {
                context.fixedBrokenCeiling = true;
            }

            if (ceiling.time > context.currentSegmentEndTime) {
                break;
            }
        }
    }

    private static addSwitchHighN2(context: EventsContext): void {
        const current = context.current;
        const previous = context.previous;

        if (context.switchingGas && previous) {
            const deltaN2 = current.gas.fN2 - previous.gas.fN2;
            const deltaHe = current.gas.fHe - previous.gas.fHe;

            if (previous.gas.fHe > 0 && deltaN2 * 5 > -deltaHe) {
                const event = EventsFactory.createSwitchToHigherN2(context.elapsed, current.startDepth, current.gas);
                context.events.add(event);
            }
        }
    }

    private static addMndExceeded(context: EventsContext, pressureSegment: PressureSegment): void {
        const current = context.current;
        // we need to check both start and end, because next segment may use another gas
        const startEnd = context.gasEnd(pressureSegment.startDepth);

        if (context.maxMnd < startEnd && context.fixedMnd) {
            this.addMndEvent(context, context.elapsed, current.startDepth);
        }

        const endEnd = context.gasEnd(pressureSegment.endDepth);
        if (context.maxMnd < endEnd && context.fixedMnd) {
            const timeStamp = context.elapsed + current.duration;
            this.addMndEvent(context, timeStamp, current.endDepth);
        }

        // we can add the event multiple times, only after it is fixed
        context.fixedMnd = endEnd <= context.maxMnd;
    }

    private static addMndEvent(context: EventsContext, timeStamp: number, depth: number): void {
        const gas = context.current.gas;
        const event = EventsFactory.createMaxEndExceeded(timeStamp, depth, gas);
        context.events.add(event);
        context.fixedMnd = true;
    }

    private static addDensityExceeded(context: EventsContext): void {
        // TODO make maxDensity configurable
        const maxDensity = 5.5; // g/l
        const current = context.current;
        const currentGas = current.gas;
        const startDepth = current.startDepth;
        const endDepth = current.endDepth;
        const isDescent = current.endDepth > current.startDepth;
        const switchToDifferentDensity = context.switchingGas;

        const startDensity = context.densityAtDepth.atDepth(currentGas, startDepth);
        const endDensity = context.densityAtDepth.atDepth(currentGas, endDepth);

        // first segment starts at surface, so there is never high density
        // skip, if event was already added at end of previous
        // add if there is a gas switch to different gas
        // ignore switch to the same gas
        // descent => density is higher at end
        if (switchToDifferentDensity && startDensity > maxDensity) {
            const event = EventsFactory.createHighDensity(context.elapsed, current.startDepth, current.gas);
            context.events.add(event);
        } else if (isDescent && endDensity > maxDensity) {
            // TODO fix depth and timestamp at exact depth the high density occurred.
            const timeStamp = context.elapsed + current.duration;
            const event = EventsFactory.createHighDensity(timeStamp, current.endDepth, current.gas);
            context.events.add(event);
        }
    }
}

class BrokenCeilingContext {
    public lastCeilingIndex = 0; // prevents search in past ceilings
    public currentSegmentStartTime = 0;
    public currentSegmentEndTime = 0;
    public fixedBrokenCeiling = true;

    constructor(public events: Events) {
    }

    public assignSegment(newSegment: Segment): void {
        this.currentSegmentStartTime = this.currentSegmentEndTime;
        this.currentSegmentEndTime = this.currentSegmentStartTime + newSegment.duration;
    }

    public belowCeiling(ceiling: Ceiling, segment: Segment): boolean {
        const duration = ceiling.time - this.currentSegmentStartTime;
        const diverDepth = segment.depthAt(duration);
        return diverDepth >= ceiling.depth;
    }
}
