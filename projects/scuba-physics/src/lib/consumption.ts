import { Precision } from './precision';
import {AlgorithmParams, BuhlmannAlgorithm} from './BuhlmannAlgorithm';
import { DepthConverter } from './depth-converter';
import { Diver } from './Diver';
import { Gases } from './Gases';
import { Options } from './Options';
import { CalculatedProfile } from './Profile';
import { Segment, Segments } from './Segments';
import { Tank, Tanks } from './Tanks';
import { Time } from './Time';
import { BinaryIntervalSearch, SearchContext } from './BinaryIntervalSearch';


class ConsumptionSegment {
    /** in seconds */
    public startTime = 0;
    /** in seconds */
    public endTime = 0;
    /** in meters */
    public averageDepth = 0;
    /** in meters */
    private _startDepth = 0;
    /** in meters */
    private _endDepth = 0;

    /**
     * @param duration in seconds
     * @param newDepth in meters
     * @param previousDepth in meters
     */
    private constructor(public duration: number, newDepth: number, previousDepth: number, averageDepth: number) {
        this.endTime = Precision.roundTwoDecimals(duration);
        this._endDepth = newDepth;
        this._startDepth = previousDepth;
        this.averageDepth = averageDepth;
    }

    /** in meters */
    public get startDepth(): number {
        return this._startDepth;
    }

    /** in meters */
    public get endDepth(): number {
        return this._endDepth;
    }

    public static fromSegment(segment: Segment): ConsumptionSegment {
        return new ConsumptionSegment(segment.duration, segment.endDepth, segment.startDepth, segment.averageDepth);
    }
}

/**
 * Calculates tank consumptions during the dive and related variables
 * (e.g. rock bottom, turn pressure, turn time)
 */
export class Consumption {
    /** Minimum bars to keep in tank, even for shallow dives */
    public static readonly minimumRockBottom = 30;

    constructor(private depthConverter: DepthConverter) { }

    private static calculateDecompression(segments: Segments, tanks: Tank[], options: Options): CalculatedProfile {
        const bGases = Gases.fromTanks(tanks);

        const algorithm = new BuhlmannAlgorithm();
        const segmentsCopy = segments.copy();
        const parameters = AlgorithmParams.forMultilevelDive(segmentsCopy, bGases, options);
        const profile = algorithm.calculateDecompression(parameters);
        return profile;
    }

    /**
     * Updates tanks consumption based on segments, also calculates emergency profile using the decompression algorithm.
     * So it is time consuming => Performance hit.
     * @param segments Profile generated by algorithm including user defined + generated ascent,
     *                 the array needs have at least 3 items (descent, swim, ascent).
     * @param options Not null profile behavior options.
     * @param tanks: All tanks used to generate the profile, their gases need to fit all used in segments param
     * @param diver diver respiratory minute volumes in Liters/minute.
     */
    public consumeFromTanks(segments: Segment[], options: Options, tanks: Tank[], diver: Diver): void {
        if (segments.length < 2) {
            throw new Error('Profile needs to contain at least 2 segments.');
        }

        const emergencyAscent = this.emergencyAscent(segments, options, tanks);
        this.consumeFromTanks2(segments, emergencyAscent, options, tanks, diver);
    }

    /**
     * Updates tanks consumption based on segments, also calculates emergency profile using the decompression algorithm.
     * So it is time consuming => Performance hit.
     * @param segments Profile generated by algorithm including user defined + generated ascent,
     *                 the array needs have at least 3 items (descent, swim, ascent).
     * @param emergencyAscent Not null array of segments representing the special ascent.
     *                 Doesn't have to be part of the segments parameter value, since in emergency we current state.
     * @param options Not null profile behavior options.
     * @param tanks: All tanks used to generate the profile, their gases need to fit all used in segments param
     * @param diver diver respiratory minute volumes in Liters/minute.
     */
    public consumeFromTanks2(segments: Segment[], emergencyAscent: Segment[], options: Options, tanks: Tank[], diver: Diver): void {
        if (segments.length < 2) {
            throw new Error('Profile needs to contain at least 2 segments.');
        }

        Tanks.resetConsumption(tanks);
        const remainToConsume = this.consumeByTanks(segments, diver.rmv);
        this.consumeByGases(segments, tanks, diver.rmv, remainToConsume);
        this.updateReserve(emergencyAscent, tanks, diver.stressRmv);
    }

    public emergencyAscent(segments: Segment[], options: Options, tanks: Tank[]): Segment[] {
        const profile = Segments.fromCollection(segments);
        const deepestPart = profile.deepestPart();
        const deepestProfile = Segments.fromCollection(deepestPart);
        const gases = Gases.fromTanks(tanks);
        const algorithm = new BuhlmannAlgorithm();
        const parameters = AlgorithmParams.forMultilevelDive(deepestProfile, gases, options);
        const emergencyProfile = algorithm.calculateDecompression(parameters);
        const emergencySegments = emergencyProfile.segments;
        const ascent = emergencySegments.slice(deepestPart.length, emergencySegments.length);
        this.addSolvingSegment(ascent, options.problemSolvingDuration);
        return ascent;
    }

    /**
     * We cant provide this method for multilevel dives, because we don't know which segment to extend
     * @param sourceSegments User defined profile
     * @param tanks The tanks used during the dive to check available gases
     * @param diver Consumption SAC definition
     * @param options ppO2 definitions needed to estimate ascent profile
     * @returns Number of minutes representing maximum time we can spend as bottom time.
     * Returns 0 in case the duration is shorter than user defined segments.
     */
    public calculateMaxBottomTime(sourceSegments: Segments, tanks: Tank[], diver: Diver, options: Options): number {
        const testSegments = this.createTestProfile(sourceSegments);
        const addedSegment = testSegments.last();

        const context: SearchContext = {
            // choosing the step based on typical dive duration
            estimationStep: Time.oneMinute * 40,
            initialValue: 0,
            maxValue: Time.oneDay,
            doWork: (newValue: number) => {
                addedSegment.duration = newValue;
                this.consumeFromProfile(testSegments, tanks, diver, options);
            },
            meetsCondition: () => Tanks.haveReserve(tanks)
        };

        const interval = new BinaryIntervalSearch();
        const addedDuration = interval.search(context);

        // the estimated max. duration is shorter, than user defined segments
        if (addedDuration === 0) {
            return 0;
        }

        // Round down to minutes directly to ensure we are in range of enough value
        const totalDuration = Time.toMinutes(sourceSegments.duration + addedDuration);
        return Precision.floor(totalDuration);
    }

    private consumeFromProfile(testSegments: Segments, tanks: Tank[], diver: Diver, options: Options) {
        const profile = Consumption.calculateDecompression(testSegments, tanks, options);
        this.consumeFromTanks(profile.segments, options, tanks, diver);
    }

    private createTestProfile(sourceSegments: Segments): Segments {
        const testSegments = sourceSegments.copy();
        const lastUserSegment = sourceSegments.last();
        testSegments.addFlat(lastUserSegment.endDepth, lastUserSegment.gas, 0);
        return testSegments;
    }

    private updateReserve(ascent: Segment[], tanks: Tank[], stressSac: number): void {
        // here the consumed during emergency ascent means reserve
        // take all segments, because we expect all segments are not user defined => don't have tank assigned
        const gasesConsumed: Map<number, number> = this.toBeConsumed(ascent, stressSac, () => true);

        // add the reserve from opposite order than consumed gas
        for (let index = 0; index <= tanks.length - 1; index++) {
            const tank = tanks[index];
            const gasCode = tank.gas.contentCode();
            let consumedLiters = gasesConsumed.get(gasCode) || 0;
            consumedLiters = this.addReserveToTank(tank, consumedLiters);
            gasesConsumed.set(gasCode, consumedLiters);
        }

        // Add minimum reserve to first tank only as back gas? This doesn't look nice for side mount.
        if (tanks[0].reserve < Consumption.minimumRockBottom) {
            tanks[0].reserve = Consumption.minimumRockBottom;
        }
    }

    private addReserveToTank(tank: Tank, consumedLiters: number): number {
        const consumedBars = Precision.ceil(consumedLiters / tank.size);
        const tankConsumedBars = (consumedBars + tank.reserve) > tank.startPressure ? tank.startPressure - tank.reserve : consumedBars;
        tank.reserve += tankConsumedBars;
        return this.extractRemaining(consumedLiters, tankConsumedBars, tank.size);
    }

    // in case of user defined gas switch without stay at depth (in ascent segment), we prolong the duration at depth
    private addSolvingSegment(ascent: Segment[], problemSolvingDuration: number): void {
        // all segments are user defined
        if (ascent.length === 0) {
            return;
        }

        const solvingDuration = problemSolvingDuration * Time.oneMinute;
        const ascentDepth = ascent[0].startDepth;
        const problemSolving = new Segment(ascentDepth, ascentDepth, ascent[0].gas, solvingDuration);
        ascent.unshift(problemSolving);
    }

    private consumeByGases(segments: Segment[], tanks: Tank[], sac: number, remainToConsume: Map<number, number>): void {
        // assigned tank will be consumed from that tank directly
        // it is always user defined segment (also in ascent)
        const gasesConsumed: Map<number, number> = this.toBeConsumedYet(segments, sac, remainToConsume, (s) => !s.tank);

        // distribute the consumed liters across all tanks with that gas starting from last one
        // to consumed stages first. This simulates one of the back mounted system procedures.
        for (let index = tanks.length - 1; index >= 0; index--) {
            const tank = tanks[index];
            const gasCode = tank.gas.contentCode();
            let consumedLiters = gasesConsumed.get(gasCode) || 0;
            consumedLiters = this.consumeFromTank(tank, consumedLiters);
            gasesConsumed.set(gasCode, consumedLiters);
        }
    }

    private consumeByTanks(segments: Segment[], sac: number): Map<number, number> {
        const remainToConsume: Map<number, number> = new Map<number, number>();
        const sacSeconds = Time.toMinutes(sac);

        segments.forEach((segment: Segment) => {
            if (segment.tank) {
                const tank = segment.tank;
                const gasCode = segment.gas.contentCode();
                const consumptionSegment = ConsumptionSegment.fromSegment(segment);
                const consumedLiters = this.consumedBySegment(consumptionSegment, sacSeconds);
                const remainingLiters = this.consumeFromTank(tank, consumedLiters);
                let consumedByGas: number = remainToConsume.get(gasCode) || 0;
                consumedByGas += remainingLiters;
                remainToConsume.set(gasCode, consumedByGas);
            }
        });

        return remainToConsume;
    }

    private consumeFromTank(tank: Tank, consumedLiters: number): number {
        const consumedBars = Precision.ceil(consumedLiters / tank.size);
        const tankConsumedBars = consumedBars > tank.endPressure ? tank.endPressure : consumedBars;
        tank.consumed += tankConsumedBars;
        return this.extractRemaining(consumedLiters, tankConsumedBars, tank.size);
    }

    private extractRemaining(consumedLiters: number, tankConsumedBars: number, tankSize: number): number {
        consumedLiters = consumedLiters - (tankConsumedBars * tankSize);
        // because of previous rounding up the consumed bars
        consumedLiters = consumedLiters < 0 ? 0 : consumedLiters;
        return consumedLiters;
    }

    private toBeConsumed(segments: Segment[], sac: number, includeSegment: (segment: Segment) => boolean): Map<number, number> {
        const emptyConsumptions = new Map<number, number>();
        return this.toBeConsumedYet(segments, sac, emptyConsumptions, includeSegment);
    }

    private toBeConsumedYet(segments: Segment[], sac: number,
        remainToConsume: Map<number, number>,
        includeSegment: (segment: Segment) => boolean): Map<number, number> {

        const sacSeconds = Time.toMinutes(sac);

        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];

            if (includeSegment(segment)) {
                const gas = segment.gas;
                const gasCode = gas.contentCode();
                const converted = ConsumptionSegment.fromSegment(segment);
                const consumedLiters = this.consumedBySegment(converted, sacSeconds);
                let consumedByGas: number = remainToConsume.get(gasCode) || 0;
                consumedByGas += consumedLiters;
                remainToConsume.set(gasCode, consumedByGas);
            }
        }

        return remainToConsume;
    }

    /**
     * Returns consumption in Liters at given segment average depth
     * @param sacSeconds Liter/second
     */
    private consumedBySegment(segment: ConsumptionSegment, sacSeconds: number) {
        const averagePressure = this.depthConverter.toBar(segment.averageDepth);
        const consumed = segment.duration * averagePressure * sacSeconds;
        return consumed;
    }
}

